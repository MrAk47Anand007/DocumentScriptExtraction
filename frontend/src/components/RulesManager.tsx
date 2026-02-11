import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { fetchRules, createRule, deleteRule } from '../features/rules/rulesSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

const ruleSchema = z.object({
    field_name: z.string().min(1, "Field name is required"),
    regex: z.string().min(1, "Regex is required").refine((val) => {
        try {
            new RegExp(val);
            return true;
        } catch {
            return false;
        }
    }, "Invalid Regex pattern"),
});

type RuleFormValues = z.infer<typeof ruleSchema>;

export const RulesManager = () => {
    const dispatch = useAppDispatch();
    const { currentTemplateId } = useAppSelector((state) => state.templates);
    const { items: rules } = useAppSelector((state) => state.rules);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<RuleFormValues>({
        resolver: zodResolver(ruleSchema),
    });

    useEffect(() => {
        if (currentTemplateId) {
            dispatch(fetchRules(currentTemplateId));
        }
    }, [currentTemplateId, dispatch]);

    const onSubmit = async (data: RuleFormValues) => {
        if (!currentTemplateId) return;
        await dispatch(createRule({ ...data, templateId: currentTemplateId }));
        reset();
    };

    if (!currentTemplateId) {
        return <div className="flex h-full items-center justify-center text-muted-foreground bg-slate-50">Select a template to manage rules</div>;
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Extraction Rules</h2>
                    <p className="text-sm text-slate-500">Define regex patterns to extract specific fields from the document.</p>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* Add Rule Form */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-3 uppercase tracking-wide">Add New Rule</h3>
                    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-4 items-start">
                        <div className="flex-1 space-y-1">
                            <Input
                                placeholder="Field Name (e.g. Invoice Number)"
                                {...register('field_name')}
                                className="bg-slate-50 border-slate-200 focus:border-blue-500"
                            />
                            {errors.field_name && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3" /> {errors.field_name.message}</p>}
                        </div>
                        <div className="flex-1 space-y-1">
                            <Input
                                placeholder="Regex Pattern (e.g. Inv-\d+)"
                                {...register('regex')}
                                className="font-mono text-sm bg-slate-50 border-slate-200 focus:border-blue-500"
                            />
                            {errors.regex && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3" /> {errors.regex.message}</p>}
                        </div>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Add Rule</Button>
                    </form>
                </div>

                {/* Rules Table */}
                <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b border-slate-200 hover:bg-slate-50">
                                <TableHead className="w-[300px] font-semibold text-slate-600">Field Name</TableHead>
                                <TableHead className="font-semibold text-slate-600">Regex Pattern</TableHead>
                                <TableHead className="w-[100px] text-right font-semibold text-slate-600">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center h-32 text-slate-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <p>No rules defined yet.</p>
                                            <p className="text-xs mt-1">Add a rule above to start extracting data.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rules.map((rule) => (
                                    <TableRow key={rule.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                                        <TableCell className="font-medium text-slate-700">{rule.field_name}</TableCell>
                                        <TableCell>
                                            <code className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-600 border border-slate-200">
                                                {rule.regex}
                                            </code>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => currentTemplateId && dispatch(deleteRule({ id: rule.id, templateId: currentTemplateId }))}
                                                className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};
