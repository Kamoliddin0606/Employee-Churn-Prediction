
import * as XLSX from 'xlsx';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, 'Monthly Details_2025-12-01_2025-12-31.xlsx');

console.log(`Reading file: ${filePath}`);

try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get headers (first row)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log("HEADERS:", jsonData[0]);
    console.log("FIRST ROW DATA:", jsonData[1]);
    console.log("SECOND ROW DATA:", jsonData[2]);
    
} catch (error) {
    console.error("Error reading file:", error);
}
