# Análise de Frequência Temporal - JurisDev

## Visão Geral

O dashboard de análise de frequência temporal permite visualizar como a frequência de termos específicos varia ao longo do tempo nos dados de jurisprudência. A interface é similar ao dashboard de normalização, com controles no lado esquerdo e visualização no centro.

## Funcionalidades Principais
What’s Next?
For the remaining part of this project, I will continue to implement and deliver the remaining products expected. 
With the last stakeholder meeting’s feedback, we can formulate a clear final sprint plan. This sprint we’ll perform minor tweaks to the current public UI and Normalization Dashboard, the issues and features missing in the Analytical dashboard will take over most of the sprint’s duration, the editing page UI will be updated alongside its text boxes logic and lastly the incorporation of the RSS service. This will be balanced with the production of the Internship project’s final presentation and documentation instructing the use of all these new features.


### 1. Análise Combinada
- **Campos de Metadados**: Decisão, Meio Processual, Descritores, Relatores
- **Pesquisa de Texto Livre**: Filtro opcional para refinar a análise
- **Combinação Simultânea**: Ambos os recursos funcionam juntos para análise mais precisa

### 2. Controles Temporais
- **Períodos**: Dia, Semana, Mês, Ano
- **Intervalo de Datas**: Seleção opcional de data inicial e final
- **Limpeza**: Botão para limpar filtros de data

Project Reflection
With the end of this internship project comes the time for a reflection on the progress achieved and business processes used.

This internship project is vastly differentiated from one of a more traditional company. Being done for a research institution of a university and in collaboration with a highly important public organ that is the Portuguese Supreme Court the business process has been 


### 3. Visualização Avançada
- **Gráfico de Linha**: Mostra a frequência ao longo do tempo
- **Estatísticas**: Resumo com total, média, pico máximo e número de períodos
- **Debug Info**: Informações técnicas para troubleshooting

## Interface

### Layout
- **Lado Esquerdo (3 colunas)**: Controles e configurações
- **Lado Direito (9 colunas)**: Gráfico temporal e estatísticas

### Controles
1. **Campo de Metadados**: Dropdown para escolher o campo a analisar
2. **Pesquisa de Texto Livre**: Input opcional para filtrar por termo específico
3. **Período Temporal**: Seleção da granularidade temporal
4. **Intervalo de Datas**: Campos de data opcionais
5. **Debug Info**: Informações técnicas em tempo real

### Visualização
- **Gráfico de Linha**: Mostra a frequência ao longo do tempo
- **Pontos Interativos**: Cada ponto representa um período
- **Eixos Formatados**: Datas formatadas de acordo com o período selecionado
- **Título Dinâmico**: Muda baseado no tipo de análise selecionado
- **Estatísticas**: Cards com métricas importantes

## APIs Utilizadas

### `/api/timeline`
- **Parâmetros**:
  - `timePeriod`: day/week/month/year
  - `field`: campo de metadados (obrigatório)
  - `q`: query de texto livre (opcional)
  - `MinAno/MaxAno`: filtros de data (opcionais)
- **Retorno**: Array de objetos com data, count e timestamp

## Como Usar

1. **Acesse** `/analytics` no sistema
2. **Selecione** o campo de metadados (Decisão, Meio Processual, etc.)
3. **Opcionalmente** digite um termo de pesquisa para filtrar
4. **Configure** o período temporal (dia/semana/mês/ano)
5. **Opcionalmente** defina um intervalo de datas
6. **Visualize** o gráfico de frequência temporal e estatísticas

## Exemplos de Uso

### Análise de Decisões
- Campo: "Decisão"
- Período: "Mês"
- Resultado: Gráfico mostrando quantas vezes cada tipo de decisão aparece por mês

### Análise com Filtro de Texto
- Campo: "Decisão"
- Texto: "responsabilidade civil"
- Período: "Ano"
- Resultado: Gráfico mostrando a evolução das decisões que mencionam "responsabilidade civil"

### Análise de Descritores
- Campo: "Descritores"
- Período: "Semana"
- Datas: 2023-01-01 a 2024-01-01
- Resultado: Gráfico mostrando a frequência de descritores por semana no período especificado

## Tecnologias

- **Frontend**: React, TypeScript, D3.js
- **Backend**: Next.js API Routes
- **Elasticsearch**: Agregações temporais e pesquisas
- **Bootstrap**: Layout responsivo

## Debug e Troubleshooting

O dashboard inclui uma seção de debug que mostra:
- Campo selecionado
- Termo de pesquisa (se houver)
- Período temporal
- Intervalo de datas
- Número de pontos de dados

Isso ajuda a identificar problemas de configuração ou dados.

## Próximas Melhorias

1. **Múltiplas Séries**: Comparar vários termos simultaneamente
2. **Filtros Avançados**: Adicionar filtros por área, relator, etc.
3. **Exportação**: Download dos dados em CSV/Excel
4. **Análise de Tendências**: Detecção automática de padrões
5. **Interatividade**: Tooltips e zoom no gráfico 