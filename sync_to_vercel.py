import pandas as pd
import requests
import json

file_path = 'w:\\PYTHON\\PICKING\\PICKING_v1.xlsb'
# TODO: Atualize esta URL para o seu novo domínio (ex: render.com, railway.app, etc)
url = 'https://dcc-lsl.onrender.com/api/sync'

def sync_data():
    print("--- Sincronização: Preservando campos para o Dashboard ---")
    try:
        with pd.ExcelFile(file_path, engine='pyxlsb') as xls:
            df_exped = pd.read_excel(xls, sheet_name='RW_EXPED')
            df_exped2 = pd.read_excel(xls, sheet_name='RW_EXPED2')
            df_items = pd.read_excel(xls, sheet_name='PROJRSITEM')

        df_items['ITEM'] = df_items['ITEM'].astype(str).str.strip().str.upper()
        item_costs = df_items.set_index('ITEM')['CUSTO'].to_dict()

        df_exped2['ITEM'] = df_exped2['ITEM'].astype(str).str.strip().str.upper()
        df_exped2['VALOR_ITEM'] = df_exped2['QTDE'] * df_exped2['ITEM'].map(item_costs).fillna(0)
        car_values = df_exped2.groupby('CARRO')['VALOR_ITEM'].sum().to_dict()

        records = []
        for _, row in df_exped.iterrows():
            car_id = str(row.get('CARRO', '')).strip()
            loc_val = str(row.get('LOC_FISICA', '')).strip()
            
            # Se não tem '-', é um controlador
            is_ctrl = '-' not in loc_val and loc_val.lower() != 'nan' and loc_val != ""

            record = {
                "CARRO": car_id,
                "CRRMOD": str(row.get('CRRMOD', '')),
                "STATUS": str(row.get('STATUS', '')),
                "SETOR": str(row.get('SETOR', row.get('DSC_SETOR', ''))),
                "CONTROLADOR": loc_val if is_ctrl else "",
                "LOC_FISICA": loc_val, # Mantendo o original para não quebrar categorias
                "DT_EMB": str(row.get('DT_EMB', '')),
                "HORAEMB": str(row.get('HORAEMB', '')),
                "HORA_CA": str(row.get('HORA_CAD', '')),
                "CADASTRO": str(row.get('CADASTRO', '')),
                "VALOR_TOTAL_CARRO": float(car_values.get(car_id, 0))
            }
            records.append(record)

        requests.post(url, json={"records": records})
        print(f"--- Sucesso! {len(records)} registros sincronizados. ---")

    except Exception as e:
        print(f"--- Erro: {str(e)} ---")

if __name__ == "__main__":
    sync_data()
