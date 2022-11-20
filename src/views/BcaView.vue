<script lang="ts">
import moment from 'moment'

import DatePicker from 'vue-datepicker-next';
import 'vue-datepicker-next/index.css';

import { defineComponent } from 'vue';
import axios from 'axios'
import { AxiosError } from 'axios'
import config from '../config/config'
import cache from '../util/cache'

const bcaPath = {
    login: `${config.server_url}/login`,
    balance: `${config.server_url}/balance`,
    statement: `${config.server_url}/statement`,
    transfer_form: `${config.server_url}/transfer_form`,
    transfer_action: `${config.server_url}/transfer_action`,
    logout: `${config.server_url}/logout`
}

interface BcaTransactionHistory{
    date: string,
    info: string,
    additionalInfo: string,
    name: string,
    amount: string,
    coin: string,
    transactionType: string,
    full_text?: string
}

// Transfer payload:
// userToken
// sourceAccount
// destinationAccount
// destinationAccountName
// amount
// notes1
// notes2
// appli1
// appli2

const dataLimit = 10;

function handleError(error: any){
    
    if(error instanceof AxiosError){
        console.error(error.response?.status)
        console.error(error.response?.data)
    }
    console.error(error.message)
    console.error(error.stack)
}

export default defineComponent({
    components: { DatePicker },
    props: {
        
    },
    data(){
        const statement_list : Array<BcaTransactionHistory> = []
        const statement_list_full : Array<string> = []
        const tf_recipient_list: Array<{account: string, name: string}> = []
        const transfer_fund_form = {
                is_loading: false,
                is_success: false,
                is_submitting: false,
                is_complete: false,
                error_message: '',
                transfer_form_data: {
                    tf_appli_code: '',
                    tf_recipient_list,
                    tf_source_account: '',
                    tf_recipient_selected: ''
                },
                transfer_form: {
                    appli1_code: '',
                    appli2_code: '',
                    amount: 0,
                    note1: '',
                    note2: ''
                }
        };

        return {
            username: '',
            password: '',
            is_login: false,
            is_submitted: false,
            login_error_message: '',
            statement_error_message: '',
            account: {
                username: '',
                token: ''
            },
            page: '',
            statement: {
                start: null,
                end: null
            },
            statement_list,
            statement_list_full,
            transfer_fund_form
        }
    },
    mounted(){
        const accountCache = cache.fetch('account')

        if(accountCache){
            this.account = JSON.parse(accountCache)
            this.is_login = true;                
        }
    },
    methods: {
        submit: async function(){
            this.login_error_message = ''

            if(!this.username){
                this.login_error_message = 'please fill username'
            }
            else if(!this.password){
                this.login_error_message = 'please fill password'
            }
            else {
                
                try {
                    const loginResult = await axios.post(bcaPath.login, `${this.username};;${this.password}`);
                                  
                    if(loginResult.data.length > 2){
                        cache.insert('account', JSON.stringify({
                            username: this.username,
                            token: loginResult.data
                        }))

                        this.account.username = this.username
                        this.account.token = loginResult.data

                        this.is_login = true

                        this.statement_list = []
                        this.statement_list_full = []
                    }
                    else {
                        this.login_error_message = 'wrong username or password (or account locked)'
                    }
                } catch (error: any) {
                    handleError(error)
                }

            }
        },
        logout: async function(){
            
            try {
                await axios.post(bcaPath.logout, this.account.token);
                                  
                cache.delete('account')

                this.account.username = ''
                this.account.token = ''
                this.is_login = false
            } catch (error: any) {
                handleError(error)
            }
        },
        openStatement: function () { this.page = 'statement' },
        openTransferFund: function () { this.page = 'transfer_fund'; this.loadTransferForm() },
        loadTransferForm: async function () {
            try {
                this.transfer_fund_form.is_complete = false
                this.transfer_fund_form.is_success = false
                this.transfer_fund_form.is_loading = true
                const transferFormRes = await axios.post(bcaPath.transfer_form, this.account.token)
                
                const tfDataString: string = transferFormRes.data
                const formData = tfDataString.split(';;')
                const appliCode = formData.shift()
                const senderAccount = formData.shift()
                const recipientList = formData.map(obj => {
                    const splitData = obj.split(':')
                    return {
                        account: splitData[0],
                        name: splitData[1]
                    }
                })

                if(appliCode && senderAccount){
                    this.transfer_fund_form.transfer_form_data.tf_appli_code = appliCode
                    this.transfer_fund_form.transfer_form_data.tf_source_account = senderAccount
                    this.transfer_fund_form.transfer_form_data.tf_recipient_list = recipientList
                }
                else {
                    throw Error("invalid transfer form data")
                }
            } catch (error) {
                handleError(error)
            }
            this.transfer_fund_form.is_loading = false
        },
        getStatement: async function(){
            this.statement_error_message = ''
            this.statement_list = []

            if(!this.statement.start){
                this.statement_error_message = 'pick start date'
            }
            else if(!this.statement.end){
                this.statement_error_message = 'pick end date'
            }
            else if(this.statement.end < this.statement.start){
                this.statement_error_message = 'end date must be higher than start date'
            }
            else {
                try {
                    const statementRes = await axios.post(bcaPath.statement, `${this.account.token};;${this.statement.start};;${this.statement.end}`)
                    const statements: string = statementRes.data

                    const statementList = statements.split(';;').reverse()
                    const statementLength = statementList.length > dataLimit ? dataLimit : statementList.length;

                    this.statement_list_full = statementList;
                    for (let index = 0; index < statementLength; index++) {
                        const currentItem = statementList.shift()
                        
                        if(currentItem){
                            const itemData = this.transactionDisplayData(currentItem)

                            this.statement_list.push(itemData)
                        }
                    }
                } catch (error: any) {
                    handleError(error)
                }
            }
        },
        transactionDisplayData: function(currentItem: string) : BcaTransactionHistory{
            const [trDate, trDataRaw, trType] = currentItem.split('|')
            const trData = trDataRaw.split('<br>')

            const itemData : BcaTransactionHistory = {
                date: trDate,
                info: '',
                additionalInfo: '',
                name: '',
                amount: '',
                transactionType: trType,
                coin: '',
                full_text: trData.join(" || ")
            };

            if(trData.length === 3){
                const [info, ns, amount] = trData
                itemData.info = info.trim()
                itemData.name = 'SYSTEM'
                itemData.amount = amount.trim()
                itemData.transactionType = 'DB'
                itemData.coin = (parseFloat(amount.replace(/,/g, '')) / 1000).toFixed(0)
            }
            else if(trData.length === 4){
                const [info, name, ns, amount] = trData
                itemData.info = info.trim()
                itemData.name = name.trim()
                itemData.amount = amount.trim()
                itemData.transactionType = 'DB'
                itemData.coin = (parseFloat(amount.replace(/,/g, '')) / 1000).toFixed(0)
            }
            else if(trData.length === 5){
                const [info, name, name2, ns, amount] = trData
                const finalName = /[0-9]/.test(name) ? name2 : name;
                const addInfo = /[0-9]/.test(name) ? name : name2;

                itemData.info = info.trim()
                itemData.additionalInfo = addInfo.trim()
                itemData.name = finalName.trim()
                itemData.amount = amount.trim()
                itemData.transactionType = 'DB'
                itemData.coin = (parseFloat(amount.replace(/,/g, '')) / 1000).toFixed(0)
            }
            else if(trData.length === 6){
                const [info, additionalInfo, amountDec, name, ns, amount] = trData
                const finalName = !/[0-9]/.test(amountDec) ? amountDec : name
                itemData.info = info.trim()
                itemData.additionalInfo = additionalInfo.trim()
                itemData.name = finalName.trim()
                itemData.amount = amount.trim()
                itemData.transactionType = 'DB'
                itemData.coin = (parseFloat(amount.replace(/,/g, '')) / 1000).toFixed(0)
            }
            else if(trData.length === 7){
                const [info, additionalInfo, amountDec, note, name, ns, amount] = trData
                itemData.info = info.trim()
                itemData.additionalInfo = additionalInfo.trim()
                itemData.name = name.trim()
                itemData.amount = amount.trim()
                itemData.transactionType = 'DB'
                itemData.coin = (parseFloat(amount.replace(/,/g, '')) / 1000).toFixed(0)
            }
            else if(trData.length === 8){
                const [info, additionalInfo, name, info1, info2, recipient, ns, amount] = trData
                itemData.info = info.trim()
                itemData.additionalInfo = additionalInfo.trim()
                itemData.name = name.trim() + `(${recipient})` 
                itemData.amount = amount.trim()
                itemData.transactionType = 'DB'
                itemData.coin = (parseFloat(amount.replace(/,/g, '')) / 1000).toFixed(0)
            }
            else {
                console.warn(currentItem)
                throw Error("not supported transaction data")
            }

            return itemData;
        },
        loadMoreTransaction: function(){
            for (let index = 0; index < dataLimit && this.statement_list_full.length > 0; index++) {
                const element = this.statement_list_full.shift();

                if(element){
                    const itemData = this.transactionDisplayData(element)
                    this.statement_list.push(itemData)
                }
            }
        },
        noBeforeLastMonth: (date: Date) => {
            return date < moment().subtract(30, 'day').toDate() || date > new Date()
        },
        noAfterToday: (date: Date) => {
            return date > new Date()
        },
        submitTransferFund: async function(){
            const selected_account = this.transfer_fund_form.transfer_form_data.tf_recipient_selected
                
            this.transfer_fund_form.error_message = ''
            this.transfer_fund_form.is_submitting = true

            if(selected_account){
                if(isNaN(this.transfer_fund_form.transfer_form.amount) && (this.transfer_fund_form.transfer_form.amount > 100000000 || this.transfer_fund_form.transfer_form.amount < 0))
                {
                    this.transfer_fund_form.error_message = 'invalid transfer amount'
                }
                else if(this.transfer_fund_form.transfer_form.appli2_code.length < 6 || isNaN(Number(this.transfer_fund_form.transfer_form.appli2_code))){
                    this.transfer_fund_form.error_message = 'invalid appli 2'
                }
                else if(this.transfer_fund_form.transfer_form.appli1_code.length < 8 || isNaN(Number(this.transfer_fund_form.transfer_form.appli1_code))){
                    this.transfer_fund_form.error_message = 'invalid appli 1'
                }
                else {
                    
                    const transferPayload = [
                        this.account.token, 
                        this.transfer_fund_form.transfer_form_data.tf_source_account,

                        selected_account,
                        this.transfer_fund_form.transfer_form_data.tf_recipient_list.find(obj => obj.account === selected_account)?.name,

                        this.transfer_fund_form.transfer_form.amount,

                        this.transfer_fund_form.transfer_form.note1 ? this.transfer_fund_form.transfer_form.note1 : '-',
                        this.transfer_fund_form.transfer_form.note2 ? this.transfer_fund_form.transfer_form.note2 : '-',

                        this.transfer_fund_form.transfer_form.appli1_code,
                        this.transfer_fund_form.transfer_form.appli2_code
                    ]

                    try {
                        const transferFundRes = await axios.post(bcaPath.transfer_action, transferPayload.join(';;'))

                        const transferResult = transferFundRes.data

                        if(transferResult === "1"){
                            this.transfer_fund_form.is_success = true
                            this.transfer_fund_form.is_complete = true
                        }
                        else {
                            this.transfer_fund_form.error_message = 'invalid appli code'
                            this.loadTransferForm()
                        }
                    } catch (error) {
                        handleError(error)
                    }
                }
            }
            else {
                this.transfer_fund_form.error_message = 'please select recipient'
            }

            this.transfer_fund_form.is_submitting = false
        }
    }
})
</script>

<template>
    <main>
        
        <div class="mx-auto container pt-6">
            <div class="border rounded-sm border-gray-300 p-6" v-if="is_login">
                <div class="grid grid-cols-2">
                    <div>
                        <span>Hello, {{account.username}}</span>
                    </div>
                    <div class="text-right">
                        <small class="text-gray-400 underline hover:no-underline cursor-pointer" @click="logout">Logout</small>
                    </div>
                </div>
                <div>
                    <small @click="openStatement" class="underline text-gray-400 cursor-pointer mr-2">Statements</small>
                    <small @click="openTransferFund"  class="underline text-gray-400 cursor-pointer">Transfer Fund</small>
                </div>

                <div v-if="page === 'statement'">
                    <date-picker class="w-full my-1" :disabled-date="noBeforeLastMonth" placeholder="start date" valueType="timestamp" v-model:value="statement.start"></date-picker>
                    <date-picker class="w-full my-1 mb-2" :disabled-date="noAfterToday" placeholder="end date" valueType="timestamp" v-model:value="statement.end"></date-picker>
                    <div class="text-right">
                        <button @click="getStatement" class="px-8 py-1 border border-gray-500 bg-gray-100 hover:bg-gray-300 rounded-sm">Submit</button>
                    </div>
                    <div class="text-red-400 text-center">
                        <small>{{statement_error_message}}</small>
                    </div>

                    <div>
                        <table class="table border-collapse table-auto w-full" v-if="statement_list.length > 0">
                            <thead>
                                <tr>
                                    <th class="text-left">Date</th>
                                    <th class="text-left">Transaction</th>
                                    <th class="text-left">Name</th>
                                    <th class="text-right">Amount</th>
                                    <th class="text-right">Coin</th>
                                    <th class="text-center">TR</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(item) in statement_list" :title="item.full_text">
                                    <td class="border">{{item.date}}</td>
                                    <td class="border">{{item.info}}<span v-if="item.additionalInfo">({{item.additionalInfo}})</span></td>
                                    <td class="border">{{item.name}}</td>
                                    <td class="border text-right">{{item.amount}}</td>
                                    <td class="border text-right">{{item.coin}}</td>
                                    <td class="border text-center">{{item.transactionType}}</td>
                                </tr>
                                <tr v-if="statement_list_full.length > 0">
                                    <td colspan="5">
                                        <small @click="loadMoreTransaction" class="text-blue-400 cursor-pointer">Show more..</small>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div v-if="page === 'transfer_fund'">
                    <div v-if="transfer_fund_form.is_loading">
                        <small>please wait..</small>
                    </div>
                    <div v-if="transfer_fund_form.is_success" class="text-green-900">
                        <small>Transfer success!</small>
                    </div>
                    <div v-if="!transfer_fund_form.is_loading && !transfer_fund_form.is_complete">
                        <div class="max-w-sm">
                            <div class="mt-2">
                                <select class="p-2 border shadow-sm w-full" v-model="transfer_fund_form.transfer_form_data.tf_recipient_selected">
                                    <option v-for="(item) in transfer_fund_form.transfer_form_data.tf_recipient_list" :value="item.account">{{item.account}} - {{item.name}}</option>
                                </select>
                            </div>
                            <div class="mt-4">
                                <small class="p-2 pl-0 mr-4">Appli 2 Code: </small>
                                <span class="bg-gray-300 p-2 pr-0 rounded-l-sm tracking-wider">
                                    {{transfer_fund_form.transfer_form_data.tf_appli_code}}
                                </span>
                                <span class="bg-gray-300 p-2 pl-0 rounded-r-sm tracking-wider">
                                    {{transfer_fund_form.transfer_form_data.tf_recipient_selected.slice(-6)}}
                                </span>
                            </div>
                            <div class="mt-4">
                                <div>Transfer Amount: IDR {{transfer_fund_form.transfer_form.amount.toLocaleString()}}</div>
                                <input type="number" v-model="transfer_fund_form.transfer_form.amount" class="p-2 border shadow-sm w-full" />
                            </div>
                            <div class="mt-4">
                                <div>Notes</div>
                                <input type="text" v-model="transfer_fund_form.transfer_form.note1" placeholder="max 18 characters" maxlength="18" class="p-2 border shadow-sm w-full" />
                                <input type="text" v-model="transfer_fund_form.transfer_form.note2" placeholder="max 18 characters" maxlength="18" class="mt-2 p-2 border shadow-sm w-full" />
                            </div>
                            <hr class="mt-4" />
                            <div class="mt-4">
                                <input type="text" v-model="transfer_fund_form.transfer_form.appli2_code" placeholder="appli 2 (6 digit)" maxlength="6" class="p-2 border shadow-sm w-full" />
                                
                                <input type="text" v-model="transfer_fund_form.transfer_form.appli1_code" placeholder="appli 1 (8 digit)" maxlength="8" class="mt-2 p-2 border shadow-sm w-full" />
                            </div>
                            <div class="text-right mt-4">
                                <button @click="submitTransferFund" :disabled="transfer_fund_form.is_submitting" class="px-8 py-1 border border-gray-500 bg-gray-100 hover:bg-gray-300 rounded-sm">Submit</button>
                            </div>
                            
                            <div class="text-red-400 text-center">
                                <small>{{transfer_fund_form.error_message}}</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="mx-auto container max-w-sm pt-6">
            <div class="border rounded-sm border-gray-300 p-6" v-if="!is_login">
                <div class="grid grid-cols-2 mb-2">
                    <div>Username</div>
                    <div>
                        <input type="text" class="w-full border border-gray-300 rounded-sm" v-model="username" />
                    </div>
                </div>
                <div class="grid grid-cols-2 mb-2">
                    <div>Password</div>
                    <div>
                        <input type="password" class="w-full border border-gray-300 rounded-sm" v-model="password" />
                    </div>
                </div>
                <div class="text-right">
                    <button @click="submit" class="px-8 py-1 border border-gray-500 bg-gray-100 hover:bg-gray-300 rounded-sm">Submit</button>
                </div>
                <div class="text-red-400 text-center">
                    <small>{{login_error_message}}</small>
                </div>
            </div>
        </div>

    </main>
</template>