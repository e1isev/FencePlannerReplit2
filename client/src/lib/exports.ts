import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FenceLine, Post, Gate, PanelSegment } from "@/types/models";
import { FenceStyleId } from "@/types/models";
import { getPricing } from "./pricing";

export function exportCuttingListCSV(
  fenceStyleId: FenceStyleId,
  panels: PanelSegment[],
  posts: Post[],
  gates: Gate[],
  lines: FenceLine[]
): void {
  const pricing = getPricing(fenceStyleId);
  
const rows: string[][] = [
    ["Product Code", "Description", "Quantity", "Unit Price", "Total Price"],
  ];
  
  const numPanels = panels.filter((p) => !p.uses_leftover_id).length;
  if (numPanels > 0) {
    rows.push([
      `PANEL-${fenceStyleId.toUpperCase()}`,
      `${pricing.name} Panel`,
      numPanels.toString(),
      `$${pricing.panel_unit_price.toFixed(2)}`,
      `$${(numPanels * pricing.panel_unit_price).toFixed(2)}`,
    ]);
  }
  
  const postCounts = {
    end: posts.filter((p) => p.category === "end").length,
    corner: posts.filter((p) => p.category === "corner").length,
    line: posts.filter((p) => p.category === "line").length,
  };
  
  if (postCounts.end > 0) {
    rows.push([
      `POST-END-${fenceStyleId.toUpperCase()}`,
      `End Post (${pricing.name})`,
      postCounts.end.toString(),
      `$${pricing.post_unit_price.toFixed(2)}`,
      `$${(postCounts.end * pricing.post_unit_price).toFixed(2)}`,
    ]);
  }
  
  if (postCounts.corner > 0) {
    rows.push([
      `POST-CORNER-${fenceStyleId.toUpperCase()}`,
      `Corner Post (${pricing.name})`,
      postCounts.corner.toString(),
      `$${pricing.post_unit_price.toFixed(2)}`,
      `$${(postCounts.corner * pricing.post_unit_price).toFixed(2)}`,
    ]);
  }
  
  if (postCounts.line > 0) {
    rows.push([
      `POST-LINE-${fenceStyleId.toUpperCase()}`,
      `Line Post (${pricing.name})`,
      postCounts.line.toString(),
      `$${pricing.post_unit_price.toFixed(2)}`,
      `$${(postCounts.line * pricing.post_unit_price).toFixed(2)}`,
    ]);
  }
  
  gates.forEach((gate) => {
    const gatePrice = (pricing.gate_prices as any)[gate.type] || 0;
    const gateDesc = gate.type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    rows.push([
      `GATE-${gate.type.toUpperCase()}`,
      gateDesc,
      "1",
      `$${gatePrice.toFixed(2)}`,
      `$${gatePrice.toFixed(2)}`,
    ]);
  });
  
  const totalLength = lines.reduce((sum, line) => sum + line.length_mm, 0);
  rows.push([]);
  rows.push(["", "Total Length", `${(totalLength / 1000).toFixed(2)}m`, "", ""]);
  
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

export function exportPDF(
  fenceStyleId: FenceStyleId,
  panels: PanelSegment[],
  posts: Post[],
  gates: Gate[],
  lines: FenceLine[]
): void {
  const doc = new jsPDF();
  const pricing = getPricing(fenceStyleId);
  
doc.setFontSize(20);
  doc.text("Fence Plan - Cutting List", 14, 20);
  
  doc.setFontSize(12);
  doc.text(`Fence Style: ${pricing.name}`, 14, 30);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 37);
  
  const tableData: any[] = [];
  
  const numPanels = panels.filter((p) => !p.uses_leftover_id).length;
  if (numPanels > 0) {
    tableData.push([
      `PANEL-${fenceStyleId.toUpperCase()}`,
      `${pricing.name} Panel`,
      numPanels,
      `$${pricing.panel_unit_price.toFixed(2)}`,
      `$${(numPanels * pricing.panel_unit_price).toFixed(2)}`,
    ]);
  }
  
  const postCounts = {
    end: posts.filter((p) => p.category === "end").length,
    corner: posts.filter((p) => p.category === "corner").length,
    line: posts.filter((p) => p.category === "line").length,
  };
  
  if (postCounts.end > 0) {
    tableData.push([
      `POST-END`,
      `End Post`,
      postCounts.end,
      `$${pricing.post_unit_price.toFixed(2)}`,
      `$${(postCounts.end * pricing.post_unit_price).toFixed(2)}`,
    ]);
  }
  
  if (postCounts.corner > 0) {
    tableData.push([
      `POST-CORNER`,
      `Corner Post`,
      postCounts.corner,
      `$${pricing.post_unit_price.toFixed(2)}`,
      `$${(postCounts.corner * pricing.post_unit_price).toFixed(2)}`,
    ]);
  }
  
  if (postCounts.line > 0) {
    tableData.push([
      `POST-LINE`,
      `Line Post`,
      postCounts.line,
      `$${pricing.post_unit_price.toFixed(2)}`,
      `$${(postCounts.line * pricing.post_unit_price).toFixed(2)}`,
    ]);
  }
  
  gates.forEach((gate) => {
    const gatePrice = (pricing.gate_prices as any)[gate.type] || 0;
    const gateDesc = gate.type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    tableData.push([
      `GATE-${gate.type.toUpperCase()}`,
      gateDesc,
      1,
      `$${gatePrice.toFixed(2)}`,
      `$${gatePrice.toFixed(2)}`,
    ]);
  });
  
  autoTable(doc, {
    head: [["Product Code", "Description", "Qty", "Unit Price", "Total"]],
    body: tableData,
    startY: 45,
    theme: "grid",
    styles: { fontSize: 10 },
    headStyles: { fillColor: [71, 85, 105] },
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 45;
  
  const totalLength = lines.reduce((sum, line) => sum + line.length_mm, 0);
  const grandTotal = tableData.reduce((sum, row) => {
    const price = parseFloat(row[4].replace("$", "").replace(",", ""));
    return sum + price;
  }, 0);
  
doc.setFontSize(12);
  doc.text(`Total Length: ${(totalLength / 1000).toFixed(2)}m`, 14, finalY + 10);
  doc.setFont("helvetica", "bold");
  doc.text(`Grand Total: $${grandTotal.toFixed(2)}`, 14, finalY + 18);
  
  doc.save(`fence-plan-${Date.now()}.pdf`);
}
