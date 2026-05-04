/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CarRecord {
  carId: string;      // CARRO
  model: string;      // CRRMOD
  status: string;     // STATUS
  sectorId: string;   // SETOR
  sectorName: string; // SETOR
  location: string;   // LOC_FISICA
  carPhysical: string;// CAR_FISICO
  embarkDate: string; // DT_EMB
  embarkTime: string; // HORAEMB
  registrationDate: string; // CADASTRO
  registrationTime: string; // HORA_CA
  VALOR_TOTAL_CARRO: number;
}

class DataService {
  private records: CarRecord[] = [];

  constructor() {
    this.records = [];
  }

  getRecords() {
    return this.records;
  }

  getRecordsByLocation(location: string) {
    return this.records.filter(r => r.location === location);
  }

  importJSON(data: any[]) {
    const mapping: Record<string, keyof CarRecord> = {
      'CARRO': 'carId',
      'CRRMOD': 'model',
      'STATUS': 'status',
      'SETOR': 'sectorId',
      'DSC_SETOR': 'sectorName',
      'LOC_FISICA': 'location',
      'CAR_FISICO': 'carPhysical',
      'DT_EMB': 'embarkDate',
      'HORAEMB': 'embarkTime',
      'CADASTRO': 'registrationDate',
      'HORA_CA': 'registrationTime',
      'VALOR_TOTAL_CARRO': 'VALOR_TOTAL_CARRO'
    };

    const newRecords: CarRecord[] = data.map(item => {
      const record: any = {};
      Object.keys(mapping).forEach(excelKey => {
        const appKey = mapping[excelKey];
        record[appKey] = item[excelKey]?.toString().trim() || '';
      });
      return record as CarRecord;
    });

    this.records = newRecords;
    return this.records;
  }

  importCSV(csvText: string) {
    const lines = csvText.split('\n');
    const headers = lines[0].split('\t'); // Assuming tab-separated from Excel copy-paste
    
    const newRecords: CarRecord[] = lines.slice(1).filter(line => line.trim()).map(line => {
      const values = line.split('\t');
      const record: any = {};
      
      const mapping: Record<string, keyof CarRecord> = {
        'CARRO': 'carId',
        'CRRMOD': 'model',
        'STATUS': 'status',
        'SETOR': 'sectorId',
        'DSC_SETOR': 'sectorName',
        'LOC_FISICA': 'location',
        'CAR_FISICO': 'carPhysical',
        'DT_EMB': 'embarkDate',
        'HORAEMB': 'embarkTime',
        'CADASTRO': 'registrationDate',
        'HORA_CA': 'registrationTime',
        'VALOR_TOTAL_CARRO': 'VALOR_TOTAL_CARRO'
      };

      headers.forEach((header, index) => {
        const key = mapping[header.trim()];
        if (key) {
          record[key] = values[index]?.trim();
        }
      });

      return record as CarRecord;
    });

    this.records = newRecords;
    return this.records;
  }
}

export const dataService = new DataService();
