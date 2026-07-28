export interface LiveOption<T> {
  value: string;
  option: T | null;
  isUnavailable: boolean;
}

export const buildLiveOptions = <T>(
  options: readonly T[],
  selectedValues: readonly string[],
  getValue: (option: T) => string,
): LiveOption<T>[] => {
  const liveOptions = options.map((option) => ({
    value: getValue(option),
    option,
    isUnavailable: false,
  }));
  const availableValues = new Set(liveOptions.map((item) => item.value));
  const unavailableOptions = [...new Set(selectedValues)]
    .filter((value) => value && !availableValues.has(value))
    .map((value) => ({ value, option: null, isUnavailable: true }));

  return [...liveOptions, ...unavailableOptions];
};

export const hasUnavailableSelection = <T>(
  options: readonly T[],
  selectedValues: readonly string[],
  getValue: (option: T) => string,
): boolean => {
  const availableValues = new Set(options.map(getValue));
  return selectedValues.some((value) => value && !availableValues.has(value));
};
