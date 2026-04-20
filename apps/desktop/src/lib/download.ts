import type { ExportData } from '../types';

export function downloadExportFile(data: ExportData): void {
  const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = data.filename;
  link.click();

  URL.revokeObjectURL(url);
}