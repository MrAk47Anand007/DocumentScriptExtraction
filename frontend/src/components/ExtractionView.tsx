import React, { useState } from 'react';
import axios from 'axios';
import { useAppSelector, useAppDispatch } from '../app/hooks';
import { setCurrentTemplate } from '../features/templates/templatesSlice';
import { Button } from '@/components/ui/button';
import { Download, FileText, Play, Upload, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ExtractionView = () => {
    const dispatch = useAppDispatch();
    const { currentTemplateId, items: templates } = useAppSelector((state) => state.templates);
    const [filename, setFilename] = useState<string | null>(null);
    const [extractedData, setExtractedData] = useState<any>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            const formData = new FormData();
            formData.append('file', selectedFile);
            setError(null);

            try {
                setIsUploading(true);
                const res = await axios.post('/upload', formData);
                setFilename(res.data.filename);
                // Clear previous results on new upload
                setExtractedData(null);
            } catch (err) {
                setError('Upload failed. Please try again.');
            } finally {
                setIsUploading(false);
            }
        }
    };

    const handleExtract = async () => {
        if (!filename || !currentTemplateId) return;
        setError(null);

        try {
            setIsExtracting(true);
            const res = await axios.post('/extract', {
                filename,
                template_id: currentTemplateId
            });
            setExtractedData(res.data.data);
        } catch (err) {
            setError('Extraction failed. Check the console for details.');
        } finally {
            setIsExtracting(false);
        }
    };

    const handleExport = async () => {
        if (!extractedData) return;
        try {
            const res = await axios.post('/export', {
                data: extractedData,
                filename: `extraction_${new Date().toISOString().slice(0, 10)}`
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `extraction.json`);
            document.body.appendChild(link);
            link.click();
        } catch (err) {
            setError('Export failed.');
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* Toolbar */}
            <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10 w-full">
                <div className="flex items-center gap-4">
                    {/* Template Selector Dropdown */}
                    <div className="relative">
                        <select
                            value={currentTemplateId || ""}
                            onChange={(e) => dispatch(setCurrentTemplate(e.target.value || null))}
                            className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 py-2 pl-3 pr-10 rounded leading-tight focus:outline-none focus:bg-white focus:border-blue-500 font-medium text-sm w-64 cursor-pointer"
                        >
                            <option value="" disabled>Select a Template...</option>
                            {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-600">
                            <ChevronDown className="h-4 w-4" />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="relative">
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={isUploading}
                        />
                        <Button variant="outline" disabled={isUploading} className="bg-white hover:bg-slate-50 text-slate-700 border-slate-300">
                            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            {isUploading ? 'Uploading...' : 'Upload PDF'}
                        </Button>
                    </div>
                    <Button
                        disabled={!filename || isExtracting || !currentTemplateId}
                        onClick={handleExtract}
                        className={cn("bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all", (!filename || isExtracting || !currentTemplateId) && "opacity-50 cursor-not-allowed")}
                        title={!currentTemplateId ? "Select a template first" : ""}
                    >
                        {isExtracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4 fill-current" />}
                        {isExtracting ? 'Extracting...' : 'Extract Data'}
                    </Button>
                    <Button variant="secondary" disabled={!extractedData} onClick={handleExport} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                        <Download className="mr-2 h-4 w-4" />
                        Export JSON
                    </Button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="bg-red-50 border-b border-red-200 p-3 flex items-center gap-2 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-6">
                <div className="grid grid-cols-2 gap-6 h-full">
                    {/* PDF Viewer Pane */}
                    <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-medium text-sm text-slate-700 flex justify-between items-center">
                            <span>PDF Viewer</span>
                            {filename && <span className="text-xs text-slate-400 font-mono">{filename}</span>}
                        </div>
                        <div className="flex-1 bg-slate-100 flex items-center justify-center relative">
                            {filename ? (
                                <iframe
                                    src={`/uploads/${filename}`}
                                    className="w-full h-full"
                                    title="PDF Viewer"
                                />
                            ) : (
                                <div className="text-center text-slate-400">
                                    <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                                        <FileText className="h-8 w-8 opacity-20" />
                                    </div>
                                    <p className="font-medium text-slate-500">No PDF Uploaded</p>
                                    <p className="text-xs mt-1">Upload a document to see the preview</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Results Pane */}
                    <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-medium text-sm text-slate-700">
                            Extraction Results
                        </div>
                        <div className="flex-1 overflow-auto bg-white p-0">
                            {extractedData ? (
                                <div className="divide-y divide-slate-100">
                                    {Object.entries(extractedData).map(([key, value]) => (
                                        <div key={key} className="grid grid-cols-3 hover:bg-slate-50 transition-colors group">
                                            <div className="col-span-1 p-3 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-100 flex items-center">
                                                {key}
                                            </div>
                                            <div className="col-span-2 p-3 text-sm text-slate-800 font-mono break-all flex items-center">
                                                {Array.isArray(value) ? (
                                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">{value.join(', ')}</span>
                                                ) : (
                                                    (value as string) || <span className="text-red-400 text-xs italic flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Not Found</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-400">
                                    <div className="text-center">
                                        <p className="text-sm">No data extracted yet.</p>
                                        <p className="text-xs mt-1 text-slate-300">
                                            {!currentTemplateId ? "Select a template above to begin" : "Click \"Extract Data\" to process the uploaded PDF"}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-2 border-t bg-slate-50 text-xs text-center text-slate-400">
                            {extractedData ? `${Object.keys(extractedData).length} fields extracted` : 'Waiting for extraction...'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
