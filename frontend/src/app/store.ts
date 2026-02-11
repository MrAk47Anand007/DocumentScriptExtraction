import { configureStore } from '@reduxjs/toolkit'
import templatesReducer from '../features/templates/templatesSlice'
import rulesReducer from '../features/rules/rulesSlice'
import scriptsReducer from '../features/scripts/scriptsSlice'
import settingsReducer from '../features/settings/settingsSlice'

export const store = configureStore({
    reducer: {
        templates: templatesReducer,
        rules: rulesReducer,
        scripts: scriptsReducer,
        settings: settingsReducer,
    },
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
