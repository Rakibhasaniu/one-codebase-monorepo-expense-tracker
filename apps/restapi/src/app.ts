import express, { Request, Response, Application, NextFunction } from "express";
import { db } from "./db/db";
const app: Application = express();
app.use(express.json());

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
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Bad request"
            })
        }
        //check user already exists
        const user = db.chain.get('users').find({ email }).value()
        if (user) {
            return res.status(409).json({
                message: "User already exists"
            })
        }
        //hashed password
        const hashedPassword = `hashed_${password}`

        const newUser = {
            id: Date.now().toString(),
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
app.post('/auth/login', (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Bad request"
            })
        }
        const user = db.chain.get('users').find({ email, password }).value()
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized"
            })
        }
        const dummyToken = `dummy_${user.id}`
        return res.status(200).json({
            message: "User logged in",
            user,
            token: dummyToken
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Internal server error"
        })
    }
})











app.listen(3000, () => {
    console.log("Server started on port 3000");
});
