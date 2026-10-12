import { FinancialTool, ToolResult } from "./types";
import { calculateEMI } from "./finance";
import { calculateSimpleInterest } from "./simpleInterest";
import { calculateCompoundInterest } from "./compoundInterest";

export interface EMIParams {
  principal: number;
  annualRate: number;
  tenureYears: number;
}

export interface EMIResult {
  principal: number;
  annualRate: number;
  tenureYears: number;
  emi: number;
  totalPayment: number;
  totalInterest: number;
}

export interface SimpleInterestParams {
  principal: number;
  annualRate: number;
  timeYears: number;
}

export interface SimpleInterestResult {
  principal: number;
  annualRate: number;
  timeYears: number;
  simpleInterest: number;
  totalAmount: number;
}

export interface CompoundInterestParams {
  principal: number;
  annualRate: number;
  timeYears: number;
}

export interface CompoundInterestResult {
  principal: number;
  annualRate: number;
  timeYears: number;
  compoundInterest: number;
  totalAmount: number;
}

type AnyFinancialTool = 
  | FinancialTool<EMIParams, EMIResult>
  | FinancialTool<SimpleInterestParams, SimpleInterestResult>
  | FinancialTool<CompoundInterestParams, CompoundInterestResult>;

const tools: Record<string, AnyFinancialTool> = {
  emi: {
    name: "emi",
    description: "EMI Calculator",
    execute: (params: EMIParams): ToolResult<EMIResult> => {
      const result = calculateEMI(
        params.principal,
        params.annualRate,
        params.tenureYears
      );

      return {
        tool: "emi",
        success: true,
        data: {
          principal: params.principal,
          annualRate: params.annualRate,
          tenureYears: params.tenureYears,
          emi: result.emi,
          totalPayment: result.totalPayment,
          totalInterest: result.totalInterest,
        },
      };
    },
  },
  simple_interest: {
    name: "simple_interest",
    description: "Simple Interest Calculator",
    execute: (params: SimpleInterestParams): ToolResult<SimpleInterestResult> => {
      const result = calculateSimpleInterest(params.principal, params.annualRate, params.timeYears);

      return {
        tool: "simple_interest",
        success: true,
        data: {
          principal: params.principal,
          annualRate: params.annualRate,
          timeYears: params.timeYears,
          simpleInterest: result.simpleInterest,
          totalAmount: result.totalAmount,
        },
      };
    },
  },
  compound_interest: {
    name: "compound_interest",
    description: "Compound Interest Calculator",
    execute: (params: CompoundInterestParams): ToolResult<CompoundInterestResult> => {
      const result = calculateCompoundInterest(params.principal, params.annualRate, params.timeYears);

      return {
        tool: "compound_interest",
        success: true,
        data: {
          principal: params.principal,
          annualRate: params.annualRate,
          timeYears: params.timeYears,
          compoundInterest: result.compoundInterest,
          totalAmount: result.totalAmount,
        },
      };
    },
  },
};

export function getTool(name: string): AnyFinancialTool | undefined {
  return tools[name];
}
