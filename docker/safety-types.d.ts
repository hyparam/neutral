export interface LoopDefinition { id: string; session: string; cwd: string; command: string }
export interface ProcessRun extends LoopDefinition { run: string; pid: number; identity: string }
export interface ProcessObservation { exists: boolean; alive: boolean; exit: number | null }
export interface SafetyRequest { action: string; session?: string; run?: string; incident?: string; reason?: string; deployment?: string }
