import React, { useEffect, useState } from "react";
import * as d3 from "d3";

interface Bucket {
  key: string;
  doc_count: number;
}

interface FieldOption {
  key: string;
  label: string;
}

interface Irregularity {
  irregular: Bucket;
  similarity: number;
  isAlternative: boolean;
}

interface GroupedIrregularities {
  canonical: Bucket;
  irregulars: Irregularity[];
}

interface NormalizationState {
  fromValue: string;
  toValue: string;
  isNormalizing: boolean;
  error: string | null;
  success: boolean;
}

// Levenshtein distance to calculate the similarity of our metadata strings 
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function getSearchUrl(field: string, value: string) {
  return `/pesquisa?${encodeURIComponent(field)}=${encodeURIComponent(value)}`;
}

const fieldMapping: Record<string, string> = {
  'Descritores': 'Descritores.Show',
  // ...
};

export default function NormalizationDashboard() {
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [selectedField, setSelectedField] = useState<string>("");
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [grouped, setGrouped] = useState<GroupedIrregularities[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [threshold, setThreshold] = useState(0.85); // Default similarity threshold
  const [normalizationState, setNormalizationState] = useState<NormalizationState | null>(null);
  const [pendingNormalization, setPendingNormalization] = useState<{from: string, to: string} | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<{[key: string]: string}>({});

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    if (!isClientReady) return;
    fetch("/api/normalization-fields")
      .then((res) => res.json())
      .then((json) => {
        setFields(json.fields);
        if (json.fields.length > 0) setSelectedField(json.fields[0].key);
      });
  }, [isClientReady]);

  useEffect(() => {
    if (!selectedField || !isClientReady) return;
    setLoading(true);
    setError(null);
    setBuckets([]);
    setGrouped([]);

    const processBuckets = (buckets: Bucket[]) => {
      // Limit to 1000 terms
      const limitedBuckets = buckets.slice(0, 2000);
      setBuckets(limitedBuckets);

      // --- Build similarity graph ---
      const nodes = limitedBuckets.map((b, i) => ({ ...b, idx: i }));
      const adj: number[][] = Array(nodes.length).fill(0).map(() => []);
      
      // Build adjacency matrix
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          if (similarity(nodes[i].key, nodes[j].key) >= threshold && nodes[i].key !== nodes[j].key) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }
      }

      // --- Find connected components (clusters) ---
      const visited = Array(nodes.length).fill(false);
      const groups: GroupedIrregularities[] = [];
      
      for (let i = 0; i < nodes.length; i++) {
        if (visited[i]) continue;
        
        // BFS to find all connected nodes
        const queue = [i];
        const cluster = [];
        visited[i] = true;
        
        while (queue.length) {
          const curr = queue.shift()!;
          cluster.push(nodes[curr]);
          for (const neighbor of adj[curr]) {
            if (!visited[neighbor]) {
              visited[neighbor] = true;
              queue.push(neighbor);
            }
          }
        }
        
        if (cluster.length > 1) {
          // Sort cluster by doc_count
          cluster.sort((a, b) => b.doc_count - a.doc_count);
          const canonical = cluster[0];
          const irregulars: Irregularity[] = cluster.slice(1).map(ir => ({
            irregular: ir,
            similarity: similarity(canonical.key, ir.key),
            isAlternative: ir.doc_count === canonical.doc_count
          }));
          groups.push({ canonical, irregulars });
        }
      }
      
      setGrouped(groups);
      setLoading(false);
    };

    fetch(`/api/indices?term=${encodeURIComponent(selectedField)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        const buckets: Bucket[] = json.termAggregation?.buckets || [];
        if (buckets.length === 0) {
          setError("Nenhum termo encontrado para este campo.");
          setLoading(false);
          return;
        }
        processBuckets(buckets);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
        setError("Erro ao carregar dados de normalização. Por favor, tente novamente.");
        setLoading(false);
      });
  }, [selectedField, isClientReady, threshold]);

  const handleNormalize = async (fromValue: string, toValue: string) => {
    setNormalizationState({
      fromValue,
      toValue,
      isNormalizing: true,
      error: null,
      success: false
    });

    try {
      const response = await fetch('/api/normalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          field: selectedField,
          fromValue,
          toValue
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to normalize values');
      }

      setNormalizationState(prev => prev ? {
        ...prev,
        isNormalizing: false,
        success: true
      } : null);

      // Refresh the data after successful normalization
      const refreshResponse = await fetch(`/api/indices?term=${encodeURIComponent(selectedField)}`);
      const refreshData = await refreshResponse.json();
      const buckets: Bucket[] = refreshData.termAggregation?.buckets || [];
      setBuckets(buckets);
      
      // Regroup the data
      const used = new Set<string>();
      const groups: GroupedIrregularities[] = [];
      const N = Math.min(buckets.length, 200);
      for (let i = 0; i < N; i++) {
        if (used.has(buckets[i].key)) continue;
        const similars: {bucket: Bucket, similarity: number}[] = [];
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          if (used.has(buckets[j].key)) continue;
          const sim = similarity(buckets[i].key, buckets[j].key);
          if (sim >= threshold && buckets[i].key !== buckets[j].key) {
            similars.push({bucket: buckets[j], similarity: sim});
          }
        }
        if (similars.length > 0) {
          const all = [{bucket: buckets[i], similarity: 1}, ...similars];
          all.sort((a, b) => b.bucket.doc_count - a.bucket.doc_count);
          const canonical = all[0].bucket;
          const irregulars: Irregularity[] = all.slice(1).map(x => ({
            irregular: x.bucket,
            similarity: x.similarity,
            isAlternative: x.bucket.doc_count === canonical.doc_count
          }));
          all.forEach(x => used.add(x.bucket.key));
          groups.push({ canonical, irregulars });
        }
      }
      setGrouped(groups);
    } catch (err) {
      setNormalizationState(prev => prev ? {
        ...prev,
        isNormalizing: false,
        error: err instanceof Error ? err.message : 'An error occurred'
      } : null);
    }
  };

  if (!isClientReady) {
    return null;
  }

  return (
    <div className="container-fluid px-4">
      <div className="row justify-content-center">
        <div className="col-12">
          <div className="card shadow-sm my-4" style={{border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.04)'}}>
            <div className="card-body" style={{fontFamily: 'Inter, Arial, sans-serif', background: '#fff'}}>
              <h2 className="mb-2" style={{ fontSize: '2rem', fontWeight: 500, letterSpacing: '-0.5px' }}>Normalização de Dados</h2>
              <div className="mb-3" style={{color: '#555', fontSize: '1.08em'}}>
                <span><b>O que é isto?</b> Esta ferramenta identifica <b>termos semelhantes</b> (potenciais duplicados ou variantes) nos metadados selecionados através de um algoritmo de <b>similaridade</b> personalizável. Pode visualizar quantas vezes cada termo aparece e sugerir a normalização para um termo preferido.</span>
              </div>
              <div className="row mb-3 g-3 align-items-end">
                <div className="col-md-7">
                  <label className="form-label mb-1">Metadados a analisar</label>
                  <select
                    className="form-select form-select-lg"
                    value={selectedField}
                    onChange={e => setSelectedField(e.target.value)}
                    disabled={loading}
                  >
                    {fields.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-5">
                  <label className="form-label mb-1">Similaridade mínima ({Math.round(threshold * 100)}%)</label>
                  <input
                    type="range"
                    min={0.7}
                    max={1}
                    step={0.01}
                    value={threshold}
                    onChange={e => setThreshold(Number(e.target.value))}
                    className="form-range"
                    disabled={loading}
                  />
                </div>
              </div>
              {loading && (
                <div className="my-4 text-center">
                  <div className="spinner-border text-primary" role="status" style={{width: '3rem', height: '3rem'}}>
                    <span className="visually-hidden">A carregar...</span>
                  </div>
                  <div className="mt-2" style={{color: '#666'}}>A analisar termos e identificar irregularidades...</div>
                </div>
              )}
              {error && <div className="alert alert-danger my-3">{error}</div>}
              {!loading && !error && buckets.length > 1000 && (
                <div className="alert alert-info my-3">
                  Mostrando os primeiros 1000 termos de {buckets.length} encontrados.
                </div>
              )}
              {normalizationState && (
                <div className={`alert ${normalizationState.error ? 'alert-danger' : normalizationState.success ? 'alert-success' : 'alert-info'} my-3`}>
                  {normalizationState.isNormalizing ? (
                    'Normalizando valores...'
                  ) : normalizationState.error ? (
                    `Erro: ${normalizationState.error}`
                  ) : normalizationState.success ? (
                    `Valores normalizados com sucesso!`
                  ) : null}
                </div>
              )}
              {normalizationState && normalizationState.success && (
                <div className="alert alert-success my-3">
                  Valores normalizados com sucesso!{' '}
                  <a href={getSearchUrl(selectedField, normalizationState.toValue)} target="_blank" rel="noopener noreferrer">
                    Ver casos normalizados
                  </a>
                </div>
              )}
              <div className="mb-3" style={{fontSize: '1.15em'}}>
                <div className="fw-bold mb-2" style={{color: '#222', fontSize: '1.2em'}}>Grupos de termos semelhantes ({grouped.length} grupos)</div>
                <div className="mb-2" style={{color: '#666', fontSize: '1em'}}>
                  <span><b>Termo:</b> O valor encontrado nos metadados.</span><br/>
                  <span><b>Nº de Casos:</b> Quantas vezes este termo aparece nos dados.</span><br/>
                  <span><b>Normalizar para:</b> Selecione o termo para o qual deseja normalizar e clique em "Normalizar" (futuramente). Esta ação só é reversível manualmente</span>
                </div>
                <div style={{ maxHeight: 700, overflowY: 'auto', fontSize: '1.08em' }}>
                  {grouped.length === 0 && !loading && (
                    <div className="text-success">Sem irregularidades encontradas.</div>
                  )}
                  {grouped.map((group, idx) => {
                    const allTerms = [group.canonical, ...group.irregulars.map(ir => ir.irregular)];
                    const dropdownOptions = allTerms.map(t => t.key);
                    const maxCount = d3.max(allTerms, t => t.doc_count) || 1;
                    return (
                      <div key={idx} className="mb-4 p-3" style={{background: '#f8f9fa', borderRadius: 10, border: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 0}}>
                        <div style={{flex: 2, minWidth: 320}}>
                          <table className="table table-borderless align-middle mb-0" style={{background: 'transparent', marginBottom: 0}}>
                            <thead>
                              <tr>
                                <th style={{fontWeight: 500, width: '40%', minWidth: 180}}>Termos detetados</th>
                                <th style={{fontWeight: 500, width: '15%', minWidth: 80, textAlign: 'center'}}>Nº de Casos</th>
                                <th style={{fontWeight: 500, width: '30%', minWidth: 180, textAlign: 'center', paddingLeft: 32}}>Normalizar para:</th>
                                <th style={{width: '15%', minWidth: 120}}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {allTerms.map((term, tIdx) => (
                                <tr key={tIdx} style={{verticalAlign: 'middle'}}>
                                  <td style={{fontWeight: 500, fontSize: '1.08em', padding: '6px 0', minWidth: 180}}>
                                    <a href={getSearchUrl(selectedField, term.key)} target="_blank" rel="noopener noreferrer" style={{color: '#2563eb', textDecoration: 'none'}}>{term.key}</a>
                                  </td>
                                  <td style={{color: '#2563eb', fontWeight: 500, fontSize: '1.08em', padding: '6px 0', textAlign: 'center', minWidth: 80}}>{term.doc_count}</td>
                                  <td style={{padding: '6px 0', textAlign: 'center', minWidth: 180, paddingLeft: 32}}>
                                    <select 
                                      className="form-select form-select-sm d-inline-block" 
                                      style={{minWidth: 180, maxWidth: 260, width: '100%'}} 
                                      value={selectedTargets[term.key] || term.key}
                                      onChange={e => {
                                        setSelectedTargets(prev => ({ ...prev, [term.key]: e.target.value }));
                                      }}
                                    >
                                      {dropdownOptions.map((opt, k) => (
                                        <option key={k} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td style={{padding: '6px 0', textAlign: 'right', minWidth: 120}}>
                                    <button 
                                      className="btn btn-primary btn-lg" 
                                      style={{fontSize: '1.08em', padding: '6px 28px'}}
                                      onClick={() => setPendingNormalization({ from: term.key, to: selectedTargets[term.key] || term.key })}
                                      disabled={normalizationState?.isNormalizing}
                                    >
                                      Normalizar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{flex: 1, minWidth: 220, padding: '0 0 0 32px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', marginTop: 8}}>
                          <div style={{fontWeight: 500, color: '#444', marginBottom: 4, fontSize: '0.98em', minHeight: 24, display: 'flex', alignItems: 'center'}}>
                            Resumo do Grupo de Termos
                          </div>
                          <div style={{fontSize: '0.93em', color: '#666', marginBottom: 4, lineHeight: 1.3}}>
                            <span>
                              Total de instâncias: <b>{allTerms.reduce((a, b) => a + b.doc_count, 0)}</b>
                              &nbsp; Maior valor: <b>{maxCount}</b> &nbsp;|&nbsp; Menor valor: <b>{d3.min(allTerms, t => t.doc_count)}</b>
                            </span>
                          </div>
                          <div style={{height: 48, width: '100%', marginBottom: 6}}>
                            <svg width="100%" height="48">
                              {allTerms.map((term, i) => (
                                <rect
                                  key={i}
                                  x={10}
                                  y={6 + i * 14}
                                  width={Math.max(30, 120 * (term.doc_count / maxCount))}
                                  height={10}
                                  fill="#2563eb"
                                  rx={3}
                                />
                              ))}
                              {allTerms.map((term, i) => (
                                <text
                                  key={i}
                                  x={10 + Math.max(30, 120 * (term.doc_count / maxCount)) + 6}
                                  y={12 + i * 14}
                                  fontSize={11}
                                  fill="#222"
                                  alignmentBaseline="middle"
                                >
                                  {term.doc_count}
                                </text>
                              ))}
                            </svg>
                          </div>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            style={{fontSize: '0.98em', width: '100%', padding: '4px 0'}}
                            onClick={() => window.open(`/pesquisa?${encodeURIComponent(selectedField)}=${encodeURIComponent(allTerms.map(t => t.key).join(' OR '))}`, '_blank')}
                          >
                            Ver todos os casos do grupo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Confirmation Modal */}
      {pendingNormalization && (
        <div className="modal show" tabIndex={-1} style={{
          display: 'block',
          background: 'rgba(0,0,0,0.15)',
          zIndex: 1050
        }}>
          <div className="modal-dialog modal-dialog-centered" style={{maxWidth: 380}}>
            <div className="modal-content" style={{
              borderRadius: 14,
              border: 'none',
              boxShadow: '0 4px 32px rgba(0,0,0,0.10)'
            }}>
              <div className="modal-header" style={{border: 'none', paddingBottom: 0}}>
                <h5 className="modal-title" style={{fontWeight: 600, fontSize: '1.18em'}}>Confirmar Normalização</h5>
              </div>
              <div className="modal-body" style={{textAlign: 'center', padding: '2rem 1.5rem 1.5rem 1.5rem'}}>
                <div style={{fontSize: '1.1em', marginBottom: 18, color: '#444'}}>
                  Tem a certeza que deseja normalizar:
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25em',
                  fontWeight: 500,
                  marginBottom: 18
                }}>
                  <span style={{
                    background: '#f3f4f6',
                    borderRadius: 6,
                    padding: '6px 14px',
                    color: '#d97706'
                  }}>{pendingNormalization.from}</span>
                  <span style={{
                    margin: '0 16px',
                    fontSize: '1.5em',
                    color: '#2563eb'
                  }}>→</span>
                  <span style={{
                    background: '#f3f4f6',
                    borderRadius: 6,
                    padding: '6px 14px',
                    color: '#059669'
                  }}>{pendingNormalization.to}</span>
                </div>
                <div style={{color: '#888', fontSize: '0.98em', marginBottom: 8}}>
                  Esta ação irá atualizar todos os casos com o termo <b>{pendingNormalization.from}</b> para <b>{pendingNormalization.to}</b>.
                </div>
              </div>
              <div className="modal-footer" style={{border: 'none', justifyContent: 'center', gap: 12, paddingBottom: 1.5 + 'rem'}}>
                <button className="btn btn-light" style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding: '6px 22px',
                  fontWeight: 500
                }} onClick={() => setPendingNormalization(null)}>
                  Cancelar
                </button>
                <button className="btn btn-success" style={{
                  borderRadius: 6,
                  padding: '6px 22px',
                  fontWeight: 500
                }} onClick={() => {
                  handleNormalize(pendingNormalization.from, pendingNormalization.to);
                  setPendingNormalization(null);
                }}>
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 


