import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { fetchScriptContent, saveScript, runScript, fetchBuilds, fetchBuildOutput, updateActiveScriptContent, appendBuildOutput, clearBuildOutput, regenerateWebhook, fetchSchedule, saveSchedule, fetchCollections, moveScript, fetchScripts } from '../features/scripts/scriptsSlice';
import { fetchSettings } from '../features/settings/settingsSlice';
import type { Script, Collection } from '../features/scripts/scriptsSlice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, Save, Terminal, Clock, Link as LinkIcon, Calendar, RefreshCw, Folder, Github, ExternalLink } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScriptsSidebar } from './ScriptsSidebar';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export const ScriptsManager = () => {
    const dispatch = useAppDispatch();
    const { items: scripts, collections, activeScriptId, activeScriptContent, builds, currentBuildOutput, saveStatus, schedule } = useAppSelector((state) => state.scripts);
    const { settings } = useAppSelector((state) => state.settings);
    const consoleRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [cronExpression, setCronExpression] = useState('');
    const [scheduleEnabled, setScheduleEnabled] = useState(false);

    useEffect(() => {
        dispatch(fetchScripts());
        dispatch(fetchCollections());
        dispatch(fetchSettings());
    }, [dispatch]);

    useEffect(() => {
        if (activeScriptId) {
            dispatch(fetchScriptContent(activeScriptId));
            dispatch(fetchBuilds(activeScriptId));
            dispatch(fetchSchedule(activeScriptId));

            // Close any existing stream when switching scripts
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            dispatch(clearBuildOutput());
        }
    }, [activeScriptId, dispatch]);

    // Update local state when schedule changes in store
    useEffect(() => {
        setCronExpression(schedule.cron);
        setScheduleEnabled(schedule.enabled);
    }, [schedule]);

    // Auto-scroll console
    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [currentBuildOutput]);

    const handleSave = async () => {
        if (activeScriptId) {
            const script = scripts.find(s => s.id === activeScriptId);
            if (script) {
                await dispatch(saveScript({
                    id: activeScriptId,
                    name: script.name,
                    content: activeScriptContent,
                    // @ts-ignore
                    sync_to_gist: script.sync_to_gist
                }));
            }
        }
    };

    const toggleGistSync = async (enabled: boolean) => {
        if (enabled && !settings['github_token']) {
            alert("Please configure your GitHub Token in Settings first.");
            return;
        }

        if (activeScriptId) {
            const script = scripts.find(s => s.id === activeScriptId);
            if (script) {
                await dispatch(saveScript({
                    id: activeScriptId,
                    name: script.name,
                    content: activeScriptContent,
                    // @ts-ignore
                    sync_to_gist: enabled
                }));
                // Functionally we should update local state optimistically or wait for fetchScripts
                // saveScript returns updated script so it should update store
                dispatch(fetchScripts());
            }
        }
    }

    const handleScheduleSave = async () => {
        if (activeScriptId) {
            await dispatch(saveSchedule({ scriptId: activeScriptId, cron: cronExpression, enabled: scheduleEnabled }));
        }
    }

    const handleRegenerateWebhook = async () => {
        if (activeScriptId && confirm("Regenerate webhook URL? The old one will stop working.")) {
            await dispatch(regenerateWebhook(activeScriptId));
        }
    }

    const handleRun = async () => {
        if (!activeScriptId) return;

        // Close existing stream
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        dispatch(clearBuildOutput());
        const resultAction = await dispatch(runScript(activeScriptId));

        if (runScript.fulfilled.match(resultAction)) {
            const buildId = resultAction.payload.build_id;

            // Start SSE
            const es = new EventSource(`/api/builds/${buildId}/stream`);
            eventSourceRef.current = es;

            es.onmessage = (event) => {
                if (event.data === '[DONE]') {
                    es.close();
                    eventSourceRef.current = null;
                    dispatch(fetchBuilds(activeScriptId)); // Refresh build list
                    return;
                }
                dispatch(appendBuildOutput(event.data));
            };

            es.onerror = () => {
                es.close();
                eventSourceRef.current = null;
                dispatch(appendBuildOutput('\n[Connection closed]'));
                dispatch(fetchBuilds(activeScriptId));
            };
        }
    };

    const handleBuildClick = async (buildId: string) => {
        if (!activeScriptId) return;
        await dispatch(fetchBuildOutput({ scriptId: activeScriptId, buildId }));
    };

    const handleMoveScript = async (collectionId: string) => {
        if (activeScriptId) {
            await dispatch(moveScript({
                scriptId: activeScriptId,
                collectionId: collectionId === 'unsorted' ? null : collectionId
            }));
            // Refresh scripts to update the sidebar
            dispatch(fetchScripts());
        }
    }

    const activeScript = scripts.find(s => s.id === activeScriptId);
    const webhookUrl = activeScript?.webhook_token ? `${window.location.origin}/api/scripts/webhook/${activeScript.webhook_token}` : 'No webhook generated';

    return (
        <div className="flex h-screen bg-white">
            {/* Sidebar List */}
            <ScriptsSidebar />

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeScriptId ? (
                    <>
                        <div className="border-b px-4 py-2 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-4">
                                <span className="font-semibold text-sm text-slate-700">
                                    {scripts.find(s => s.id === activeScriptId)?.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Folder className="h-3.5 w-3.5 text-slate-400" />
                                    <Select
                                        value={activeScript?.collection_id || 'unsorted'}
                                        onValueChange={handleMoveScript}
                                    >
                                        <SelectTrigger className="h-6 w-[140px] text-xs border-slate-200">
                                            <SelectValue placeholder="Collection" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unsorted">Unsorted</SelectItem>
                                            {collections.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex gap-2 items-center">
                                {/* Gist Info */}
                                {activeScript?.gist_url && (
                                    <a href={activeScript.gist_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline mr-2" title="View on GitHub Gist">
                                        <Github className="h-3.5 w-3.5" />
                                    </a>
                                )}

                                {/* Sync Toggle */}
                                <div className="flex items-center gap-1.5 mr-2" title="Sync to GitHub Gist">
                                    <Switch
                                        id="gist-sync-toggle"
                                        checked={activeScript?.sync_to_gist || false}
                                        onCheckedChange={toggleGistSync}
                                        className="h-4 w-7"
                                    />
                                    <Label htmlFor="gist-sync-toggle" className="text-[10px] text-slate-500 cursor-pointer">Gist</Label>
                                </div>

                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleSave} disabled={saveStatus === 'saving'}>
                                    <Save className="h-3 w-3" />
                                    {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                                </Button>
                                <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleRun}>
                                    <Play className="h-3 w-3" />
                                    Run
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 relative">
                            <textarea
                                className="absolute inset-0 w-full h-full p-4 font-mono text-sm resize-none focus:outline-none bg-slate-900 text-slate-100"
                                value={activeScriptContent || ''}
                                onChange={(e) => dispatch(updateActiveScriptContent(e.target.value))}
                                spellCheck={false}
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                        Select a script to start editing
                    </div>
                )}
            </div>

            {/* Right Panel: Builds, Console, Settings */}
            <div className="w-96 border-l flex flex-col bg-slate-50 overflow-y-auto">
                {/* Triggers Section */}
                {activeScriptId && (
                    <div className="p-4 border-b bg-white space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                                    <LinkIcon className="h-3 w-3" /> Webhook
                                </h3>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleRegenerateWebhook} title="Regenerate Token">
                                    <RefreshCw className="h-3 w-3 text-slate-400" />
                                </Button>
                            </div>
                            <div className="bg-slate-100 p-2 rounded border border-slate-200 text-[10px] font-mono break-all text-slate-600 select-all">
                                {webhookUrl}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> Schedule
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500">{scheduleEnabled ? 'On' : 'Off'}</span>
                                    <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} className="scale-75 origin-right" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    className="h-7 text-xs font-mono"
                                    placeholder="Cron (e.g. */15 * * * *)"
                                    value={cronExpression}
                                    onChange={(e) => setCronExpression(e.target.value)}
                                />
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleScheduleSave}>Save</Button>
                            </div>
                            {schedule.nextRun && (
                                <div className="mt-1 text-[10px] text-slate-400">
                                    Next run: {new Date(schedule.nextRun).toLocaleString()}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="h-1/3 flex flex-col border-b min-h-[150px]">
                    <div className="px-3 py-2 border-b bg-slate-100 text-xs font-semibold text-slate-500 uppercase flex items-center gap-2">
                        <Clock className="h-3 w-3" /> Build History
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {builds.length === 0 && <div className="p-4 text-xs text-slate-400 text-center italic">No builds yet</div>}
                        {builds.map((build, index) => (
                            <div
                                key={build.id}
                                className="px-3 py-2 border-b border-slate-100 hover:bg-white cursor-pointer transition-colors"
                                onClick={() => handleBuildClick(build.id)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-slate-700">#{builds.length - index}</span>
                                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide",
                                        build.status === 'success' ? "bg-green-100 text-green-700" :
                                            build.status === 'failure' ? "bg-red-100 text-red-700" :
                                                "bg-yellow-100 text-yellow-700"
                                    )}>{build.status}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span>{new Date(build.started_at).toLocaleTimeString()}</span>
                                    <span>{build.triggered_by}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex-1 flex flex-col min-h-[200px]">
                    <div className="px-3 py-2 border-b bg-slate-950 text-xs font-semibold text-slate-400 uppercase flex items-center gap-2">
                        <Terminal className="h-3 w-3" /> Console Output
                    </div>
                    <div
                        ref={consoleRef}
                        className="flex-1 overflow-y-auto bg-slate-950 text-slate-300 p-3 font-mono text-xs whitespace-pre-wrap"
                    >
                        {currentBuildOutput || <span className="text-slate-600 italic">Ready...</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};
