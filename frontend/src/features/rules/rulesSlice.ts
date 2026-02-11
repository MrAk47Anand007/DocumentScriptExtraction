import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'

export interface Rule {
    id: string
    field_name: string
    regex: string
    template_id: string
}

interface RulesState {
    items: Rule[]
    status: 'idle' | 'loading' | 'succeeded' | 'failed'
    error: string | null
}

const initialState: RulesState = {
    items: [],
    status: 'idle',
    error: null,
}

export const fetchRules = createAsyncThunk('rules/fetchRules', async (templateId: string) => {
    const response = await axios.get(`/api/templates/${templateId}/rules`)
    return response.data
})

export const createRule = createAsyncThunk('rules/createRule', async (data: { templateId: string; field_name: string; regex: string }) => {
    const response = await axios.post(`/api/templates/${data.templateId}/rules`, {
        field_name: data.field_name,
        regex: data.regex
    })
    return response.data
})

export const updateRule = createAsyncThunk('rules/updateRule', async (data: { id: string; field_name: string; regex: string; templateId: string }) => {
    const response = await axios.put(`/api/templates/${data.templateId}/rules/${data.id}`, {
        field_name: data.field_name,
        regex: data.regex
    })
    return response.data
})

export const deleteRule = createAsyncThunk('rules/deleteRule', async (data: { id: string; templateId: string }) => {
    await axios.delete(`/api/templates/${data.templateId}/rules/${data.id}`)
    return data.id
})

const rulesSlice = createSlice({
    name: 'rules',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchRules.pending, (state) => {
                state.status = 'loading'
            })
            .addCase(fetchRules.fulfilled, (state, action) => {
                state.status = 'succeeded'
                state.items = action.payload
            })
            .addCase(fetchRules.rejected, (state, action) => {
                state.status = 'failed'
                state.error = action.error.message || 'Failed to fetch rules'
            })
            .addCase(createRule.fulfilled, (state, action) => {
                state.items.push(action.payload)
            })
            .addCase(updateRule.fulfilled, (state, action) => {
                const index = state.items.findIndex((r) => r.id === action.payload.id)
                if (index !== -1) {
                    state.items[index] = action.payload
                }
            })
            .addCase(deleteRule.fulfilled, (state, action) => {
                state.items = state.items.filter((r) => r.id !== action.payload)
            })
    },
})

export default rulesSlice.reducer
