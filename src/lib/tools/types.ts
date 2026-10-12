export interface ToolResult<T = unknown> {
  tool: string;
  success: boolean;
  data?: T;
  error?: string;
}

export interface FinancialTool<TParams = unknown, TResult = unknown> {
  name: string;
  description: string;
  execute: (params: TParams) => ToolResult<TResult>;
}
