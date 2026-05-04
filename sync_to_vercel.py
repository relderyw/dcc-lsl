import pandas as pd
import requests
import json

file_path = 'w:\\PYTHON\\PICKING\\PICKING_v1.xlsb'
url = 'https://dcc-lsl.vercel.app/api/sync'

def sync_data():
    print("--- Lendo Excel e calculando valores ---")
    try:
        with pd.ExcelFile(file_path, engine='pyxlsb') as xls:
            df_exped = pd.read_excel(xls, sheet_name='RW_EXPED')
            df_exped2 = pd.read_excel(xls, sheet_name='RW_EXPED2')
            df_items = pd.read_excel(xls, sheet_name='PROJRSITEM')

        # 1. Mapear custos
        df_items['ITEM'] = df_items['ITEM'].astype(str).str.strip().str.upper()
        item_costs = df_items.set_index('ITEM')['CUSTO'].to_dict()

        # 2. Calcular valor por carro
        df_exped2['ITEM'] = df_exped2['ITEM'].astype(str).str.strip().str.upper()
        df_exped2['CUSTO_UNIT'] = df_exped2['ITEM'].map(item_costs).fillna(0)
        df_exped2['VALOR_ITEM'] = df_exped2['QTDE'] * df_exped2['CUSTO_UNIT']
        
        car_values = df_exped2.groupby('CARRO')['VALOR_ITEM'].sum().to_dict()

        # 3. Preparar JSON para o Vercel
        records = []
        for _, row in df_exped.iterrows():
            car_id = str(row.get('CARRO', '')).strip()
            record = {
                "CARRO": car_id,
                "CRRMOD": str(row.get('CRRMOD', '')),
                "STATUS": str(row.get('STATUS', '')),
                "SETOR": str(row.get('SETOR', '')),
                "DSC_SETOR": str(row.get('DSC_SETOR', '')),
                "LOC_FISICA": str(row.get('LOC_FISICA', '')),
                "CAR_FISICO": str(row.get('CAR_FISICO', '')),
                "DT_EMB": str(row.get('DT_EMB', '')),
                "HORAEMB": str(row.get('HORAEMB', '')),
                "HORA_CA": str(row.get('HORA_CAD', '')),
                "CADASTRO": str(row.get('CADASTRO', '')),
                "VALOR_TOTAL_CARRO": float(car_values.get(car_id, 0))
            }
            records.append(record)

        print(f"--- Enviando {len(records)} registros para o Vercel ---")
        response = requests.post(url, json={"records": records})
        
        if response.status_code == 200:
            print(f"--- Sucesso! Dados sincronizados com sucesso. ---")
        else:
            print(f"--- Erro no Vercel: {response.text} ---")

    except Exception as e:
        print(f"--- Erro: {str(e)} ---")

if __name__ == "__main__":
    sync_data()
