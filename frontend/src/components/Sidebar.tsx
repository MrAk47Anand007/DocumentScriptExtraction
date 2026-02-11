import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { createTemplate, setCurrentTemplate, deleteTemplate } from '../features/templates/templatesSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FileText, Plus, Trash2, Search } from 'lucide-react';

export const Sidebar = () => {
    const dispatch = useAppDispatch();
    const { items: templates, currentTemplateId } = useAppSelector((state) => state.templates);
    const [isCreating, setIsCreating] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const handleCreate = async () => {
        if (!newTemplateName.trim()) return;
        await dispatch(createTemplate({ name: newTemplateName }));
        setNewTemplateName('');
        setIsCreating(false);
    };

    const filteredTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="w-64 border-r bg-white flex flex-col h-screen shadow-sm z-10">
            <div className="p-4 border-b flex items-center justify-between bg-slate-50/50">
                <h2 className="font-semibold text-xs tracking-wider text-slate-500 uppercase">TEMPLATES</h2>
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-slate-200" onClick={() => setIsCreating(!isCreating)}>
                    <Plus className="h-4 w-4 text-slate-600" />
                </Button>
            </div>

            <div className="p-2">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                    <Input
                        placeholder="Search templates..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 pl-8 text-xs bg-slate-50 border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                </div>
            </div>

            {isCreating && (
                <div className="px-2 pb-2 mb-2 border-b border-dashed border-slate-200">
                    <div className="bg-blue-50 p-2 rounded-md border border-blue-100">
                        <Input
                            autoFocus
                            placeholder="Template Name"
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            className="mb-2 h-7 text-xs bg-white"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" className="w-full h-6 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreate}>Save</Button>
                            <Button size="sm" variant="ghost" className="w-full h-6 text-xs hover:bg-white" onClick={() => setIsCreating(false)}>Cancel</Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
                {filteredTemplates.length === 0 && (
                    <div className="text-xs text-center text-slate-400 py-4 italic">No templates found</div>
                )}
                {filteredTemplates.map((template) => (
                    <div
                        key={template.id}
                        className={cn(
                            "group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md cursor-pointer transition-all duration-200",
                            currentTemplateId === template.id
                                ? "bg-blue-50 text-blue-700 border-l-4 border-blue-600 shadow-sm"
                                : "text-slate-600 hover:bg-slate-100 border-l-4 border-transparent"
                        )}
                        onClick={() => dispatch(setCurrentTemplate(template.id))}
                    >
                        <div className="flex items-center gap-2 truncate min-w-0">
                            <FileText className={cn("h-3.5 w-3.5 flex-shrink-0", currentTemplateId === template.id ? "text-blue-500" : "text-slate-400")} />
                            <span className="truncate">{template.name}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete template?')) dispatch(deleteTemplate(template.id));
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                ))}
            </div>

            <div className="p-3 border-t bg-slate-50 text-xs text-slate-400 text-center">
                v0.1.0-beta
            </div>
        </div>
    );
};
