import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import axios from 'axios'

export interface Template {
    id: string
    name: string
    description: string
    created_at: string
}

interface TemplatesState {
    items: Template[]
    status: 'idle' | 'loading' | 'succeeded' | 'failed'
    error: string | null
    currentTemplateId: string | null
}

const initialState: TemplatesState = {
    items: [],
    status: 'idle',
    error: null,
    currentTemplateId: null,
}

export const fetchTemplates = createAsyncThunk('templates/fetchTemplates', async () => {
    const response = await axios.get('/api/templates')
    return response.data
})

export const createTemplate = createAsyncThunk('templates/createTemplate', async (data: { name: string; description?: string }) => {
    const response = await axios.post('/api/templates', data)
    return response.data
})

export const deleteTemplate = createAsyncThunk('templates/deleteTemplate', async (id: string) => {
    await axios.delete(`/api/templates/${id}`)
    return id
})

const templatesSlice = createSlice({
    name: 'templates',
    initialState,
    reducers: {
        setCurrentTemplate(state, action: PayloadAction<string | null>) {
            state.currentTemplateId = action.payload
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchTemplates.pending, (state) => {
                state.status = 'loading'
            })
            .addCase(fetchTemplates.fulfilled, (state, action) => {
                state.status = 'succeeded'
                state.items = action.payload
            })
            .addCase(fetchTemplates.rejected, (state, action) => {
                state.status = 'failed'
                state.error = action.error.message || 'Failed to fetch templates'
            })
            .addCase(createTemplate.fulfilled, (state, action) => {
                state.items.push(action.payload)
            })
            .addCase(deleteTemplate.fulfilled, (state, action) => {
                state.items = state.items.filter((t) => t.id !== action.payload)
                if (state.currentTemplateId === action.payload) {
                    state.currentTemplateId = null
                }
            })
    },
})

export const { setCurrentTemplate } = templatesSlice.actions

export default templatesSlice.reducer
