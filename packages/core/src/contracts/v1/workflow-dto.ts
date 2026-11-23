import { workflowBrief, type WorkflowBrief } from './workflow-brief.js';
import { workflowPlanDocument, type WorkflowPlanDocument } from './workflow-plan.js';
import { workflowReceipt, type WorkflowReceipt } from './workflow-execution.js';

export class WorkflowBriefDto {
    private constructor(readonly value: WorkflowBrief) {}
    static parse(value: unknown): WorkflowBriefDto { return new WorkflowBriefDto(workflowBrief.parse(value)); }
}
export class WorkflowPlanDto {
    private constructor(readonly value: WorkflowPlanDocument) {}
    static parse(value: unknown): WorkflowPlanDto { return new WorkflowPlanDto(workflowPlanDocument.parse(value)); }
}
export class WorkflowExecutionDto {
    private constructor(readonly value: WorkflowReceipt) {}
    static parse(value: unknown): WorkflowExecutionDto { return new WorkflowExecutionDto(workflowReceipt.parse(value)); }
}
