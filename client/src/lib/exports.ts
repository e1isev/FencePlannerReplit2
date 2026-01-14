import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FenceLine, Post, Gate, PanelSegment, FenceColourMode, FenceCategoryId } from "@/types/models";
import { FenceStyleId } from "@/types/models";
import { calculateCosts } from "./pricing";
import { getFenceStyleLabel } from "@/config/fenceStyles";

export function exportCuttingListCSV(args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceHeightM: number;
  fenceColourMode: FenceColourMode;
  panels: PanelSegment[];
  posts: Post[];
  gates: Gate[];
  lines: FenceLine[];
}): void {
  const {
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColourMode,
    panels,
    posts,
    gates,
    lines,
  } = args;
  const costs = calculateCosts({
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColourMode,
    panels,
    posts,
    gates,
    lines,
  });

  const rows: string[][] = [
    ["Item", "SKU", "Quantity", "Unit Price", "Total Price"],
  ];

  costs.lineItems.forEach((item) => {
    rows.push([
      item.name,
      item.sku ?? "",
      item.quantity.toString(),
      item.unitPrice === null ? "" : `$${item.unitPrice.toFixed(2)}`,
      item.lineTotal === null ? "" : `$${item.lineTotal.toFixed(2)}`,
    ]);
  });

  rows.push([]);
  rows.push(["", "Total Length", `${(costs.totalLengthMm / 1000).toFixed(2)}m`, "", ""]);
  rows.push([
    "",
    "Grand Total",
    "",
    "",
    costs.grandTotal === null ? "" : `$${costs.grandTotal.toFixed(2)}`,
  ]);
  
  const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `fence-cutting-list-${Date.now()}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportPDF(args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceHeightM: number;
  fenceColourMode: FenceColourMode;
  panels: PanelSegment[];
  posts: Post[];
  gates: Gate[];
  lines: FenceLine[];
}): void {
  const {
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColourMode,
    panels,
    posts,
    gates,
    lines,
  } = args;
  const doc = new jsPDF();
  const costs = calculateCosts({
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColourMode,
    panels,
    posts,
    gates,
    lines,
  });

  doc.setFontSize(20);
  doc.text("Fence Plan - Cutting List", 14, 20);

  doc.setFontSize(12);
  doc.text(`Fence Style: ${getFenceStyleLabel(fenceStyleId)}`, 14, 30);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 37);

  const tableData: any[] = [];

  costs.lineItems.forEach((item) => {
    tableData.push([
      item.name,
      item.sku ?? "",
      item.quantity,
      item.unitPrice === null ? "" : `$${item.unitPrice.toFixed(2)}`,
      item.lineTotal === null ? "" : `$${item.lineTotal.toFixed(2)}`,
    ]);
  });
  
  autoTable(doc, {
    head: [["Item", "SKU", "Qty", "Unit Price", "Total"]],
    body: tableData,
    startY: 45,
    theme: "grid",
    styles: { fontSize: 10 },
    headStyles: { fillColor: [71, 85, 105] },
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 45;
  
  doc.setFontSize(12);
  doc.text(`Total Length: ${(costs.totalLengthMm / 1000).toFixed(2)}m`, 14, finalY + 10);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Grand Total: ${costs.grandTotal === null ? "N/A" : `$${costs.grandTotal.toFixed(2)}`}`,
    14,
    finalY + 18
  );
  
  doc.save(`fence-plan-${Date.now()}.pdf`);
}
