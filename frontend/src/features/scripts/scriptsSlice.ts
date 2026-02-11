import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import axios from 'axios'

export interface Script {
    id: string
    name: string
    filename: string
    description?: string
    content?: string
    created_at: string
    updated_at: string
    last_run?: string
    webhook_token?: string
    schedule_cron?: string
    schedule_enabled?: boolean
}

export interface Build {
    id: string
    script_id: string
    status: 'pending' | 'success' | 'failure'
    started_at: string
    completed_at?: string
    triggered_by: string
}

interface ScriptsState {
    items: Script[];
    activeScriptId: string | null;
    activeScriptContent: string;
    builds: Build[];
    currentBuildOutput: string;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
    saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
    schedule: {
        cron: string;
        enabled: boolean;
        nextRun: string | null;
        status: 'idle' | 'loading' | 'saved' | 'failed';
    };
}

const initialState: ScriptsState = {
    items: [],
    activeScriptId: null,
    activeScriptContent: '',
    builds: [],
    currentBuildOutput: '',
    status: 'idle',
    error: null,
    saveStatus: 'idle',
    schedule: {
        cron: '',
        enabled: false,
        nextRun: null,
        status: 'idle'
    }
}

export const fetchScripts = createAsyncThunk('scripts/fetchScripts', async () => {
    const response = await axios.get('/api/scripts')
    return response.data
})

export const fetchScriptContent = createAsyncThunk('scripts/fetchScriptContent', async (id: string) => {
    const response = await axios.get(`/api/scripts/${id}`)
    return response.data
})

export const createScript = createAsyncThunk('scripts/createScript', async (name: string) => {
    const response = await axios.post('/api/scripts', { name, content: '# New script\nprint("Hello World")' })
    return response.data
})

export const saveScript = createAsyncThunk('scripts/saveScript', async (data: { id: string; name: string; content: string }) => {
    const response = await axios.post('/api/scripts', data)
    return response.data
})

export const runScript = createAsyncThunk('scripts/runScript', async (id: string) => {
    const response = await axios.post(`/api/scripts/${id}/run`)
    return response.data
})

export const fetchBuilds = createAsyncThunk('scripts/fetchBuilds', async (scriptId: string) => {
    const response = await axios.get(`/api/builds/${scriptId}`)
    return response.data
})

export const fetchBuildOutput = createAsyncThunk('scripts/fetchBuildOutput', async ({ scriptId, buildId }: { scriptId: string; buildId: string }) => {
    const response = await axios.get(`/api/builds/output/${scriptId}/${buildId}`)
    return response.data.output
})

export const regenerateWebhook = createAsyncThunk('scripts/regenerateWebhook', async (scriptId: string) => {
    const response = await axios.post(`/api/scripts/${scriptId}/webhook/regenerate`)
    return { scriptId, token: response.data.webhook_token }
})

export const fetchSchedule = createAsyncThunk('scripts/fetchSchedule', async (scriptId: string) => {
    const response = await axios.get(`/api/scripts/${scriptId}/schedule`)
    return response.data
})

export const saveSchedule = createAsyncThunk('scripts/saveSchedule', async (data: { scriptId: string; cron: string; enabled: boolean }) => {
    const response = await axios.put(`/api/scripts/${data.scriptId}/schedule`, { cron: data.cron, enabled: data.enabled })
    return response.data
})

export const deleteSchedule = createAsyncThunk('scripts/deleteSchedule', async (scriptId: string) => {
    await axios.delete(`/api/scripts/${scriptId}/schedule`)
    return null
})

const scriptsSlice = createSlice({
    name: 'scripts',
    initialState,
    reducers: {
        setActiveScript(state, action: PayloadAction<string | null>) {
            state.activeScriptId = action.payload
            state.activeScriptContent = ''
            state.currentBuildOutput = ''
            state.builds = []
            state.schedule = { cron: '', enabled: false, nextRun: null, status: 'idle' } // Reset schedule
        },
        updateActiveScriptContent(state, action: PayloadAction<string>) {
            state.activeScriptContent = action.payload
        },
        appendBuildOutput(state, action: PayloadAction<string>) {
            state.currentBuildOutput += action.payload
        },
        clearBuildOutput(state) {
            state.currentBuildOutput = ''
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchScripts.fulfilled, (state, action) => {
                state.items = action.payload
                state.status = 'succeeded'
            })
            .addCase(fetchScriptContent.fulfilled, (state, action) => {
                state.activeScriptContent = action.payload.content
            })
            .addCase(createScript.fulfilled, (state, action) => {
                state.items.push(action.payload)
                state.activeScriptId = action.payload.id
                state.activeScriptContent = '# New script\nprint("Hello World")'
            })
            .addCase(saveScript.pending, (state) => {
                state.saveStatus = 'saving'
            })
            .addCase(saveScript.fulfilled, (state) => {
                state.saveStatus = 'saved'
            })
            .addCase(saveScript.rejected, (state) => {
                state.saveStatus = 'failed'
            })
            .addCase(fetchBuilds.fulfilled, (state, action) => {
                state.builds = action.payload
            })
            .addCase(fetchBuildOutput.fulfilled, (state, action) => {
                state.currentBuildOutput = action.payload
            })
            .addCase(regenerateWebhook.fulfilled, (state, action) => {
                const script = state.items.find(s => s.id === action.payload.scriptId)
                if (script) {
                    script.webhook_token = action.payload.token
                }
            })
            .addCase(fetchSchedule.fulfilled, (state, action) => {
                state.schedule.cron = action.payload.schedule_cron || ''
                state.schedule.enabled = action.payload.schedule_enabled
                state.schedule.nextRun = action.payload.next_run_time
                state.schedule.status = 'idle'
            })
            .addCase(saveSchedule.fulfilled, (state, action) => {
                state.schedule.cron = action.payload.schedule_cron || ''
                state.schedule.enabled = action.payload.schedule_enabled
                state.schedule.nextRun = action.payload.next_run_time
                state.schedule.status = 'saved'
            })
            .addCase(deleteSchedule.fulfilled, (state) => {
                state.schedule.cron = ''
                state.schedule.enabled = false
                state.schedule.nextRun = null
                state.schedule.status = 'idle'
            })
    }
})

export const { setActiveScript, updateActiveScriptContent, appendBuildOutput, clearBuildOutput } = scriptsSlice.actions
export default scriptsSlice.reducer
