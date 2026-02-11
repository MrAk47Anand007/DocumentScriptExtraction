import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { fetchSettings, saveSettings } from '../features/settings/settingsSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, Github, Key } from 'lucide-react';

export const SettingsManager = () => {
    const dispatch = useAppDispatch();
    const { settings, status, error } = useAppSelector((state) => state.settings);

    const [githubToken, setGithubToken] = useState('');
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        if (status === 'idle') {
            dispatch(fetchSettings());
        }
    }, [status, dispatch]);

    useEffect(() => {
        if (status === 'succeeded') {
            setGithubToken(settings['github_token'] || '');
            setGeminiApiKey(settings['gemini_api_key'] || '');
        }
    }, [settings, status]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage('');
        try {
            await dispatch(saveSettings({
                'github_token': githubToken,
                'gemini_api_key': geminiApiKey
            })).unwrap();
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    if (status === 'loading' && Object.keys(settings).length === 0) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <SettingsIcon className="h-6 w-6 text-slate-500" />
                Settings
            </h2>

            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {saveMessage && (
                <Alert className="bg-green-50 text-green-800 border-green-200">
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{saveMessage}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Github className="h-5 w-5" /> GitHub Integration</CardTitle>
                    <CardDescription>
                        Configure your GitHub Personal Access Token to enable Gist synchronization for scripts.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="github_token">Personal Access Token (Classic)</Label>
                        <Input
                            id="github_token"
                            type="password"
                            placeholder="ghp_..."
                            value={githubToken}
                            onChange={(e) => setGithubToken(e.target.value)}
                        />
                        <p className="text-xs text-slate-500">
                            Required scope: <code>gist</code>
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Gemini API</CardTitle>
                    <CardDescription>
                        API Key for Google Gemini (Generative AI features).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="gemini_api_key">API Key</Label>
                        <Input
                            id="gemini_api_key"
                            type="password"
                            placeholder="AIza..."
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Settings
                </Button>
            </div>
        </div>
    );
};

const SettingsIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);
