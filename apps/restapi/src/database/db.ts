import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import * as lodash from 'lodash'

export type User = {
    id: string
    name: string
    email: string
    password: string
}
export type Currency = 'BDT' | 'USD' | 'EUR'

export type Account = {
    id: string
    userId: string
    currency: Currency
    balance: number
    createdAt: Date
    updatedAt: Date
}

export type TransactionType = 'deposit' | 'expense' | 'transfer_in' | 'transfer_out'

export type Transaction = {
    id: string
    accountId: string
    amount: number
    type: TransactionType
    description: string
    date: Date
}

export type DB = {
    users: User[]
    accounts: Account[]
    transactions: Transaction[]
}
class LowWithLodash<T> extends Low<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data')
}

const defaultData: DB = {
    users: [],
    accounts: [],
    transactions: [],
}
const adapter = new JSONFile<DB>('db.json')

export const db = new LowWithLodash(adapter, defaultData)
