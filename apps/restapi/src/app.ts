import express, { Request, Response, Application, NextFunction } from "express";
import { Account, db, Transaction, User } from "./database/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app: Application = express();
app.use(express.json());

const JWT_SECRET = "your-secret-key"; // In production, use environment variables

// Middleware to authenticate JWT
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ message: "Invalid or expired token" });
        (req as any).user = user;
        next();
    });
};

app.get("/health", (_req: Request, res: Response) => {
    res.send("Server is running");
});

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500).json({
        message: error.message
    })
});

// *** use cases *************
app.post('/auth/register', async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password || password.length < 8) {
            return res.status(400).json({
                message: "Bad request. Password must be at least 8 characters."
            })
        }
        //check user already exists
        const user = db.chain.get('users').find((u: any) => u.email === email).value()
        if (user) {
            return res.status(409).json({
                message: "User already exists"
            })
        }

        //hashed password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser: User = {
            id: crypto.randomUUID(),
            name,
            email,
            password: hashedPassword
        }
        db.data.users.push(newUser)
        await db.write()
        const { password: _, ...userWithoutPassword } = newUser
        return res.status(201).json({
            message: "User created",
            user: userWithoutPassword
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Internal server error"
        })
    }
})

app.post('/auth/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Bad request"
            })
        }
        const user = db.chain.get('users').find((u: any) => u.email === email).value()
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized - Invalid credentials"
            })
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Unauthorized - Invalid credentials"
            })
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: "User logged in",
            user: { id: user.id, name: user.name, email: user.email },
            token
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Internal server error"
        })
    }
})


// *** Account Management *************

app.post('/accounts', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { userId, currency, balance } = req.body;
        if (!userId || !currency) {
            return res.status(400).json({ message: "User ID and currency are required" });
        }
        //check if acount already exists
        const accountExists = db.chain.get('accounts').find({ userId, currency }).value();
        if (accountExists) {
            return res.status(400).json({ message: "Account already exists" });
        }
        if (!['BDT', 'USD', 'EUR'].includes(currency)) {
            return res.status(400).json({ message: "Currency not supported" });
        }

        const newAccount = {
            id: crypto.randomUUID(),
            userId,
            currency,
            balance: balance || 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        db.data.accounts.push(newAccount as Account);
        await db.write();

        return res.status(201).json({
            message: "Account created",
            account: newAccount
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get('/accounts/:userid', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.params.userid;
    const accounts = db.chain.get('accounts').filter((a: any) => a.userId === userId).value();
    return res.status(200).json(accounts);
});

app.get('/accounts/:id', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const accountId = req.params.id as string;

    const account = db.chain.get('accounts').find((a: any) => a.id === accountId && a.userId === userId).value();
    if (!account) return res.status(404).json({ message: "Account not found" });

    const recentTransactions = db.chain.get('transactions')
        .filter((t: any) => t.accountId === accountId)
        .orderBy(['date'], ['desc'])
        .take(5)
        .value();

    return res.status(200).json({
        ...account,
        recentTransactions
    });
});

app.delete('/accounts/:id', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const accountId = req.params.id as string;

    const account = db.chain.get('accounts').find((a: any) => a.id === accountId && a.userId === userId).value();
    if (!account) return res.status(404).json({ message: "Account not found" });

    if (account.balance !== 0) {
        return res.status(400).json({ message: "Non-zero balance. Cannot delete account." });
    }

    db.data.accounts = db.data.accounts.filter(acc => acc.id !== accountId);
    await db.write();

    return res.status(200).json({ message: "Account deleted" });
});

// *** Transaction Management *************

app.post('/accounts/:accountId/deposit', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { amount, description, currency } = req.body;
        const accountId = req.params.accountId as string;
        const userId = (req as any).user.id; // Correctly get userId from authenticated user
        if (!amount || !currency) return res.status(400).json({ message: "Amount and currency are required" });
        if (amount <= 0) return res.status(400).json({ message: "Amount must be positive" });

        const account = db.chain.get('accounts').find((a: any) => a.id === accountId && a.userId === userId).value();
        if (!account) return res.status(404).json({ message: "Account not found" });
        if (account.currency !== currency) return res.status(400).json({ message: "Currency mismatch" });

        const updatedAccount = {
            ...account,
            balance: account.balance + amount,
            updatedAt: new Date()
        };

        // Corrected lowdb update: find by predicate and assign
        db.chain.get('accounts').find((a: any) => a.id === accountId).assign(updatedAccount).value();
        await db.write();

        const transaction = {
            id: crypto.randomUUID(),
            accountId,
            amount,
            type: 'income' as const,
            description: description || 'income',
            date: new Date()
        };

        db.chain.get('transactions').push(transaction).value();
        await db.write();

        return res.status(200).json({
            message: "Deposit successful",
            balance: updatedAccount.balance,
            transaction
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post('/accounts/:accountId/expense', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { amount, description } = req.body;
        const userId = (req as any).user.id;
        const accountId = req.params.accountId as string;

        if (amount <= 0) return res.status(400).json({ message: "Amount must be positive" });

        const account = db.chain.get('accounts').find((a: any) => a.id === accountId && a.userId === userId).value();
        if (!account) return res.status(404).json({ message: "Account not found" });

        if (account.balance < amount) {
            return res.status(400).json({ message: "Insufficient funds" });
        }

        const updatedAccount = {
            ...account,
            balance: account.balance - amount,
            updatedAt: new Date()
        };

        db.chain.get('accounts').find((a: any) => a.id === accountId).assign(updatedAccount).value();
        await db.write();

        const transaction = {
            id: crypto.randomUUID(),
            accountId,
            amount,
            type: 'expense' as const,
            description: description || 'Expense',
            date: new Date()
        };

        db.chain.get('transactions').push(transaction).value();
        await db.write();

        return res.status(200).json({
            message: "Expense recorded",
            balance: updatedAccount.balance,
            transaction
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get('/transactions/:accountId', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const accountId = req.params.accountId as string;

    const account = db.chain.get('accounts').find((a: any) => a.id === accountId && a.userId === userId).value();
    if (!account) return res.status(404).json({ message: "Account not found" });

    let query = db.chain.get('transactions').filter((t: any) => t.accountId === accountId);

    const { type, startDate, endDate } = req.query;
    if (type) query = query.filter({ type: type as any });
    if (startDate) query = query.filter(t => new Date(t.date) >= new Date(startDate as string));
    if (endDate) query = query.filter(t => new Date(t.date) <= new Date(endDate as string));

    const transactions = query.orderBy(['date'], ['desc']).value();
    return res.status(200).json(transactions);
});

app.post('/accounts/:accountId/transfer', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { destinationAccountId, amount } = req.body;
        const userId = (req as any).user.id;
        const accountId = req.params.accountId as string;

        if (amount <= 0) return res.status(400).json({ message: "Amount must be positive" });

        const sourceAccount = db.chain.get('accounts').find((a: any) => a.id === accountId && a.userId === userId).value();
        const destAccount = db.chain.get('accounts').find((a: any) => a.id === destinationAccountId && a.userId === userId).value();

        if (!sourceAccount || !destAccount) {
            return res.status(404).json({ message: "One or both accounts not found" });
        }

        if (sourceAccount.balance < amount) {
            return res.status(400).json({ message: "Insufficient funds in source account" });
        }

        sourceAccount.balance -= amount;
        sourceAccount.updatedAt = new Date();
        destAccount.balance += amount;
        destAccount.updatedAt = new Date();

        const outTransaction = {
            id: Date.now().toString() + '_out',
            accountId,
            amount,
            type: 'transfer_out',
            description: `Transfer to ${destinationAccountId}`,
            date: new Date()
        };

        const inTransaction = {
            id: Date.now().toString() + '_in',
            accountId: destinationAccountId,
            amount,
            type: 'transfer_in',
            description: `Transfer from ${sourceAccount}`,
            date: new Date()
        };

        db.data.transactions.push(outTransaction as any, inTransaction as any);
        await db.write();

        return res.status(200).json({
            message: "Transfer successful",
            sourceBalance: sourceAccount.balance,
            destinationBalance: destAccount.balance,
            transactions: [outTransaction, inTransaction]
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
});


app.listen(3000, () => {
    console.log("Server started on port 3000");
});
