export const formatAUD = (value: number): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safeValue));
  const prefix = safeValue < 0 ? "-AU$" : "AU$";
  return `${prefix}${formatted}`;
};
