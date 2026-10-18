export declare function pythonCalculation<T>(operation: 'stress' | 'bond' | 'futures' | 'earnings' | 'cscore' | 'value_rating', args: unknown[]): Promise<T>;
export declare function calculateWithRuntime<T>(operation: 'stress' | 'bond' | 'futures' | 'earnings', args: unknown[], node: () => T): Promise<T>;
