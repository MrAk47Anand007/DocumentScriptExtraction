import { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './app/hooks';
import { fetchTemplates } from './features/templates/templatesSlice';
import { Sidebar } from './components/Sidebar';
import { ExtractionView } from './components/ExtractionView';
import { RulesManager } from './components/RulesManager';
import { ScriptsManager } from './components/ScriptsManager';
import { SettingsManager } from './components/SettingsManager';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Settings, Code } from 'lucide-react';

export const App = () => {
    const dispatch = useAppDispatch();
    const { status } = useAppSelector((state) => state.templates);
    // Persist tab state, default to extract
    const [activeTab, setActiveTab] = useState<'extract' | 'rules' | 'scripts' | 'settings'>('extract');

    useEffect(() => {
        if (status === 'idle') {
            dispatch(fetchTemplates());
        }
    }, [status, dispatch]);

    return (
        <div className="flex h-screen bg-background text-foreground font-sans antialiased overflow-hidden flex-col">
            {/* Top Navigation Bar */}
            <header className="border-b bg-white px-6 py-3 shadow-sm flex items-center justify-between z-20 relative">
                <div className="flex items-center gap-6">
                    <h1 className="text-xl font-semibold tracking-tight text-slate-800 flex items-center gap-2">
                        <span className="bg-blue-600 text-white rounded p-1"><FileText className="h-4 w-4" /></span>
                        Document Extraction Portal
                    </h1>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full">
                        <TabsList className="bg-slate-100 p-1 rounded-lg">
                            <TabsTrigger value="extract" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm px-4 py-1.5 text-sm font-medium transition-all flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                <span>Extraction</span>
                            </TabsTrigger>
                            <TabsTrigger value="rules" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm px-4 py-1.5 text-sm font-medium transition-all flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                <span>Rules</span>
                            </TabsTrigger>
                            <TabsTrigger value="scripts" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm px-4 py-1.5 text-sm font-medium transition-all flex items-center gap-2">
                                <Code className="h-4 w-4" />
                                <span>Scripts</span>
                            </TabsTrigger>
                            <TabsTrigger value="settings" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm px-4 py-1.5 text-sm font-medium transition-all flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                <span>Settings</span>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden bg-slate-50 relative">
                {/* Extraction Tab Content */}
                <div className={activeTab === 'extract' ? 'h-full flex flex-col' : 'hidden'}>
                    <ExtractionView />
                </div>

                {/* Rules Tab Content */}
                <div className={activeTab === 'rules' ? 'h-full flex' : 'hidden'}>
                    <Sidebar />
                    <div className="flex-1 overflow-hidden">
                        <RulesManager />
                    </div>
                </div>

                {/* Scripts Tab Content */}
                <div className={activeTab === 'scripts' ? 'h-full flex flex-col' : 'hidden'}>
                    <ScriptsManager />
                </div>

                {/* Settings Tab Content */}
                <div className={activeTab === 'settings' ? 'h-full flex flex-col overflow-y-auto' : 'hidden'}>
                    <SettingsManager />
                </div>
            </main>
        </div>
    );
};

export default App;
