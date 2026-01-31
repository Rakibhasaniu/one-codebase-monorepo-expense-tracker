import { LargeNumberLike } from "crypto";
import { CurrencyType } from "./account.entities";

export enum TransactionType {
    EXPENSE = 'expense',
    INCOME = 'income',
    TRANSFER = 'transfer',
}
export type TransactionTypeType = `${TransactionType}`;

export interface Transaction {
    id: string;
    accountId: string;
    type: TransactionTypeType;
    amount: LargeNumberLike;
    lastBalance: LargeNumberLike;
    createdAt: Date;

} 
