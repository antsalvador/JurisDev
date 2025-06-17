import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface Bucket {
  key: string;
  doc_count: number;
}

interface FieldOption {
  key: string;
  label: string;
}

const CHARTS = [
  { key: 'bar', label: 'Top Termos' },
  { key: 'donut', label: 'Proporção' },
  { key: 'hist', label: 'Distribuição de Frequências' },
  { key: 'trend', label: 'Tendência Temporal' }
];

export default function AnalyticsDashboard() {
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [selectedField, setSelectedField] = useState<string>('');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChart, setSelectedChart] = useState<string>('bar');
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const histRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const TOP_N = 10;

  // Fetch fields
  useEffect(() => {
    fetch('/api/normalization-fields')
      .then(res => res.json())
      .then(json => {
        setFields(json.fields);
        if (json.fields.length > 0) setSelectedField(json.fields[0].key);
      });
  }, []);

  // Fetch buckets
  useEffect(() => {
    if (!selectedField) return;
    setLoading(true);
    setError(null);
    fetch(`/api/indices?term=${encodeURIComponent(selectedField)}`)
      .then(res => res.json())
      .then(json => {
        setBuckets(json.termAggregation?.buckets || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Erro ao carregar dados analíticos.');
        setLoading(false);
      });
  }, [selectedField]);

  // Modern Bar Chart
  useEffect(() => {
    if (selectedChart !== 'bar' || !barRef.current || buckets.length === 0) return;
    barRef.current.innerHTML = '';
    const data = buckets.slice(0, TOP_N);
    const width = 600, barHeight = 36, margin = { top: 30, right: 40, bottom: 40, left: 220 };
    const height = margin.top + margin.bottom + barHeight * data.length;
    const svg = d3.select(barRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);
    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.doc_count) || 1])
      .range([margin.left, width - margin.right]);
    const y = d3.scaleBand()
      .domain(data.map(d => d.key))
      .range([margin.top, height - margin.bottom])
      .padding(0.18);

    // Gradient
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'bar-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#60a5fa');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#2563eb');

    // Bars
    svg.append('g')
      .selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', x(0))
      .attr('y', d => y(d.key)!)
      .attr('width', d => x(d.doc_count) - x(0))
      .attr('height', y.bandwidth())
      .attr('rx', 10)
      .attr('fill', 'url(#bar-gradient)')
      .attr('filter', 'drop-shadow(0px 2px 8px rgba(37,99,235,0.10))')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        window.open(`/pesquisa?${encodeURIComponent(selectedField)}=${encodeURIComponent(d.key)}`, '_blank');
      })
      .on('mouseover', function (event, d) {
        d3.select(this).attr('fill', '#1d4ed8');
        d3.select(barRef.current).select('.tooltip')
          .style('display', 'block')
          .html(`<b>${d.key}</b><br/>${d.doc_count} casos`)
          .style('left', (event.offsetX + 20) + 'px')
          .style('top', (event.offsetY - 10) + 'px');
      })
      .on('mousemove', function (event) {
        d3.select(barRef.current).select('.tooltip')
          .style('left', (event.offsetX + 20) + 'px')
          .style('top', (event.offsetY - 10) + 'px');
      })
      .on('mouseout', function () {
        d3.select(this).attr('fill', 'url(#bar-gradient)');
        d3.select(barRef.current).select('.tooltip').style('display', 'none');
      });

    // Y axis
    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSizeOuter(0))
      .selectAll('text')
      .attr('font-size', 16)
      .attr('font-weight', 500);

    // X axis
    svg.append('g')
      .attr('transform', `translate(0,${margin.top})`)
      .call(d3.axisTop(x).ticks(5).tickSizeOuter(0))
      .selectAll('text')
      .attr('font-size', 14);

    // Value labels
    svg.append('g')
      .selectAll('text.value')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'value')
      .attr('x', d => x(d.doc_count) + 12)
      .attr('y', d => (y(d.key) || 0) + y.bandwidth() / 2 + 7)
      .attr('fill', '#222')
      .attr('font-size', 18)
      .attr('font-weight', 600)
      .text(d => d.doc_count);

    // Tooltip
    d3.select(barRef.current)
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('background', '#fff')
      .style('border', '1px solid #e5e7eb')
      .style('border-radius', '8px')
      .style('padding', '10px 18px')
      .style('pointer-events', 'none')
      .style('display', 'none')
      .style('font-size', '1.08em')
      .style('box-shadow', '0 4px 16px rgba(0,0,0,0.10)');
  }, [buckets, selectedField, selectedChart]);

  // Modern Donut Chart
  useEffect(() => {
    if (selectedChart !== 'donut' || !pieRef.current || buckets.length === 0) return;
    pieRef.current.innerHTML = '';
    const data = buckets.slice(0, TOP_N);
    const width = 340, height = 260, radius = Math.min(width, height) / 2 - 10;
    const svg = d3.select(pieRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);
    const color = d3.scaleSequential()
      .domain([0, data.length])
      .interpolator(d3.interpolateCool);
    const pie = d3.pie<Bucket>().value(d => d.doc_count);
    const arc = d3.arc<d3.PieArcDatum<Bucket>>()
      .innerRadius(radius * 0.65)
      .outerRadius(radius);

    svg.selectAll('path')
      .data(pie(data))
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('fill', (d, i) => color(i))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0px 2px 8px rgba(37,99,235,0.10))')
      .on('click', (event, d) => {
        window.open(`/pesquisa?${encodeURIComponent(selectedField)}=${encodeURIComponent(d.data.key)}`, '_blank');
      })
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 0.7);
        d3.select(pieRef.current).select('.tooltip')
          .style('display', 'block')
          .html(`<b>${d.data.key}</b><br/>${d.data.doc_count} casos`)
          .style('left', (event.offsetX + 20) + 'px')
          .style('top', (event.offsetY - 10) + 'px');
      })
      .on('mousemove', function (event) {
        d3.select(pieRef.current).select('.tooltip')
          .style('left', (event.offsetX + 20) + 'px')
          .style('top', (event.offsetY - 10) + 'px');
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 1);
        d3.select(pieRef.current).select('.tooltip').style('display', 'none');
      });

    // Center label
    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 8)
      .attr('font-size', 22)
      .attr('font-weight', 700)
      .attr('fill', '#222')
      .text('Top Termos');

    // Tooltip
    d3.select(pieRef.current)
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('background', '#fff')
      .style('border', '1px solid #e5e7eb')
      .style('border-radius', '8px')
      .style('padding', '10px 18px')
      .style('pointer-events', 'none')
      .style('display', 'none')
      .style('font-size', '1.08em')
      .style('box-shadow', '0 4px 16px rgba(0,0,0,0.10)');
  }, [buckets, selectedField, selectedChart]);

  // Modern Histogram
  // Compute histogram data
  const freqCounts: Record<number, number> = {};
  buckets.forEach(b => {
    freqCounts[b.doc_count] = (freqCounts[b.doc_count] || 0) + 1;
  });
  const histData = Object.entries(freqCounts)
    .map(([freq, count]) => ({ freq: +freq, count }))
    .sort((a, b) => a.freq - b.freq)
    .slice(0, 20);

  useEffect(() => {
    if (selectedChart !== 'hist' || !histRef.current || histData.length === 0) return;
    histRef.current.innerHTML = '';
    const width = 340, height = 200, margin = { top: 30, right: 20, bottom: 40, left: 50 };
    const svg = d3.select(histRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    const x = d3.scaleBand()
      .domain(histData.map(d => d.freq.toString()))
      .range([margin.left, width - margin.right])
      .padding(0.18);
    const y = d3.scaleLinear()
      .domain([0, d3.max(histData, d => d.count) || 1])
      .range([height - margin.bottom, margin.top]);
    svg.append('g')
      .selectAll('rect')
      .data(histData)
      .enter()
      .append('rect')
      .attr('x', d => x(d.freq.toString())!)
      .attr('y', d => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', d => y(0) - y(d.count))
      .attr('rx', 6)
      .attr('fill', 'url(#hist-gradient)')
      .attr('filter', 'drop-shadow(0px 2px 8px rgba(16,185,129,0.10))');
    // Gradient
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'hist-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#6ee7b7');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#10b981');
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickFormat(d => d));
    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', margin.top - 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', 16)
      .attr('font-weight', 600)
      .attr('fill', '#222')
      .text('Distribuição de Frequências dos Termos');
  }, [buckets, selectedField, selectedChart, histData]);

  // Rare terms table (only for bar/donut)
  const rareTerms = buckets.filter(b => b.doc_count === 1).slice(0, 10);
  // Top terms for trend selection
  const topTerms = buckets.slice(0, TOP_N);

  return (
    <div style={{
      maxWidth: 900,
      margin: '0 auto',
      padding: '2.5rem 1.5rem',
      fontFamily: 'Inter, Arial, sans-serif'
    }}>
      <div className="card shadow" style={{ borderRadius: 18, boxShadow: '0 4px 32px rgba(0,0,0,0.08)', padding: 32, background: '#fff' }}>
        <h2 style={{ fontWeight: 700, fontSize: '2.2rem', marginBottom: 8, letterSpacing: '-1px' }}>Análise Gráfica de Metadados</h2>
        <div style={{ color: '#555', fontSize: '1.15em', marginBottom: 18, fontWeight: 400 }}>
          Visualize padrões, tendências e outliers dos metadados de jurisprudência. Use os gráficos para identificar termos mais frequentes, proporções, distribuição de frequências e tendências temporais.
        </div>
        <div className="row mb-4 g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label mb-1" style={{ fontWeight: 500 }}>Metadados a visualizar</label>
            <select
              className="form-select form-select-lg"
              value={selectedField}
              onChange={e => setSelectedField(e.target.value)}
              style={{ fontSize: '1.1em', borderRadius: 8 }}
            >
              {fields.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label mb-1" style={{ fontWeight: 500 }}>Gráfico</label>
            <select
              className="form-select form-select-lg"
              value={selectedChart}
              onChange={e => setSelectedChart(e.target.value)}
              style={{ fontSize: '1.1em', borderRadius: 8 }}
            >
              {CHARTS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        {selectedChart === 'trend' && (
          <div className="mb-4">
            <label className="form-label mb-1" style={{ fontWeight: 500 }}>Termo para tendência temporal</label>
            <select
              className="form-select"
              value={selectedTerm || ''}
              onChange={e => setSelectedTerm(e.target.value)}
              style={{ fontSize: '1.08em', borderRadius: 8, maxWidth: 340 }}
            >
              <option value="">Selecione um termo</option>
              {topTerms.map(t => (
                <option key={t.key} value={t.key}>{t.key}</option>
              ))}
            </select>
            {/* Here you would render the D3 time trend chart in trendRef */}
            <div ref={trendRef} style={{ width: 700, minHeight: 340, margin: '2rem auto 0 auto' }} />
            {!selectedTerm && <div style={{ color: '#888', fontSize: '1.08em', marginTop: 12 }}>Selecione um termo para visualizar a tendência temporal.</div>}
          </div>
        )}
        {loading && <div style={{ fontSize: '1.2em', color: '#2563eb', margin: '2rem 0' }}>A carregar gráfico...</div>}
        {error && <div className="alert alert-danger">{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 400 }}>
          {selectedChart === 'bar' && <div ref={barRef} style={{ width: '100%', maxWidth: 700, minHeight: 420, margin: '0 auto 2rem auto' }} />}
          {selectedChart === 'donut' && <div ref={pieRef} style={{ width: 380, minHeight: 340, margin: '0 auto 2rem auto' }} />}
          {selectedChart === 'hist' && <div ref={histRef} style={{ width: 420, minHeight: 260, margin: '0 auto 2rem auto' }} />}
        </div>
        {(selectedChart === 'bar' || selectedChart === 'donut') && (
          <div className="card" style={{
            background: '#f8fafc',
            borderRadius: 12,
            boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
            padding: '1.2rem 1.5rem',
            margin: '2rem auto 0 auto',
            maxWidth: 700
          }}>
            <h6 style={{ fontWeight: 600, color: '#222', marginBottom: 10 }}>Termos raros (apenas 1 caso):</h6>
            <ul style={{ fontSize: '1.05em', color: '#2563eb', paddingLeft: 18, maxHeight: 120, overflowY: 'auto', marginBottom: 0 }}>
              {rareTerms.length === 0 && <li style={{ color: '#666' }}>Nenhum termo raro.</li>}
              {rareTerms.map((b, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  <a href={`/pesquisa?${encodeURIComponent(selectedField)}=${encodeURIComponent(b.key)}`} target="_blank" rel="noopener noreferrer">{b.key}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
} 