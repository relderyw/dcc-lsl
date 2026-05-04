import pandas as pd
import os

# Caminhos dos arquivos
file_path = 'w:\\PYTHON\\PICKING\\PICKING_v1.xlsb'
output_path = 'w:\\PYTHON\\PICKING\\PICKING_v1_PROCESSADO.xlsb'

def process_data():
    print("--- Iniciando processamento de dados ---")
    
    try:
        with pd.ExcelFile(file_path, engine='pyxlsb') as xls:
            print("--- Lendo abas...")
            df_exped = pd.read_excel(xls, sheet_name='RW_EXPED')
            df_exped2 = pd.read_excel(xls, sheet_name='RW_EXPED2')
            df_items = pd.read_excel(xls, sheet_name='PROJRSITEM')

        print("--- Preparando PROJRSITEM (Custo por Item)...")
        # Garantir que ITEM seja string para o join
        df_items['ITEM'] = df_items['ITEM'].astype(str).str.strip()
        # Se houver duplicatas no PROJRSITEM, pegamos a mais recente ou a primeira
        df_items = df_items.drop_duplicates(subset=['ITEM'], keep='last')
        item_costs = df_items.set_index('ITEM')['CUSTO'].to_dict()

        print("--- Processando RW_EXPED2 (Cálculo de Custo por Carro)...")
        df_exped2['ITEM'] = df_exped2['ITEM'].astype(str).str.strip()
        df_exped2['CUSTO_UNIT'] = df_exped2['ITEM'].map(item_costs).fillna(0)
        df_exped2['VALOR_ITEM'] = df_exped2['QTDE'] * df_exped2['CUSTO_UNIT']
        
        # Agrupar por CARRO para ter o valor total do carro
        car_values = df_exped2.groupby('CARRO')['VALOR_ITEM'].sum().reset_index()
        car_values.columns = ['CARRO', 'VALOR_TOTAL_CARRO']
        
        print("--- Atualizando RW_EXPED com o valor total do carro...")
        # Limpar CARRO no df_exped
        df_exped['CARRO'] = df_exped['CARRO'].astype(str).str.strip()
        
        # Merge do valor total do carro no RW_EXPED
        df_final = df_exped.merge(car_values, on='CARRO', how='left')
        df_final['VALOR_TOTAL_CARRO'] = df_final['VALOR_TOTAL_CARRO'].fillna(0)

        print(f"--- Salvando resultado em {output_path}...")
        # Salvar em formato Excel (xlsx) pois salvar em xlsb via pandas/pyxlsb é mais complexo
        # Geralmente o usuário prefere .xlsx se for para subir para a nuvem
        xlsx_output = output_path.replace('.xlsb', '.xlsx')
        
        with pd.ExcelWriter(xlsx_output, engine='openpyxl') as writer:
            df_final.to_excel(writer, sheet_name='RW_EXPED', index=False)
            df_exped2.to_excel(writer, sheet_name='RW_EXPED2', index=False)
            df_items.to_excel(writer, sheet_name='PROJRSITEM', index=False)
            
        print(f"--- Sucesso! Arquivo gerado: {xlsx_output}")
        
    except Exception as e:
        print(f"--- Erro durante o processamento: {str(e)}")

if __name__ == "__main__":
    process_data()
