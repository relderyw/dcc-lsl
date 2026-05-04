const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'w:\\PYTHON\\PICKING\\PICKING_v1.xlsb';

try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets['RW_EXPED2'];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log('Headers:', data[0]);
    console.log('Row 1:', data[1]);
    console.log('Row 2:', data[2]);
} catch (e) {
    console.error(e);
}
