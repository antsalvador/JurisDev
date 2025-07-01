import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useRouter } from 'next/router';
import AdvancedFilters from './AdvancedFilters';

interface Bucket {
  key: string;
  doc_count: number;
}

interface FieldOption {
  key: string;
  label: string;
}

interface SearchResult {
  _source: any;
  score: number;
  highlight?: any;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface TimeSeriesData {
  date: string;
  count: number;
  timestamp: number;
  eclis: string[];
}

interface TermFrequencyData {
  term: string;
  frequency: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

const CHARTS = [
  { key: 'bar', label: 'Top Termos' },
  { key: 'donut', label: 'Proporção' },
  { key: 'hist', label: 'Distribuição de Frequências' },
  { key: 'trend', label: 'Tendência Temporal' },
  { key: 'timeline', label: 'Registros por Período' }
];

const TIME_PERIODS = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'year', label: 'Ano' }
];

const AVAILABLE_FIELDS: FieldOption[] = [
  { key: 'Decisão', label: 'Decisão' },
  { key: 'Meio Processual', label: 'Meio Processual' },
  { key: 'Descritores', label: 'Descritores' },
  { key: 'Relator Nome Profissional', label: 'Relatores' }
];

interface Filter {
  id: number;
  field: string;
  value: string;
}

interface AnalyticsFilters {
  selectedField: string;
  timePeriod: string;
  freeTextQuery: string;
  dateRange: {
    start: string;
    end: string;
  };
  metadataFilters: Filter[];
}

// Custom hook for debouncing
function useDebounce(value: any, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function AnalyticsDashboard() {
  const router = useRouter();
  const [filters, setFilters] = useState<AnalyticsFilters>({
    selectedField: 'Decisão',
    timePeriod: 'month',
    freeTextQuery: '',
    dateRange: { start: '', end: '' },
    metadataFilters: [{ id: 1, field: 'Decisão', value: '' }]
  });
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChart, setSelectedChart] = useState('timeline');
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [showRareValues, setShowRareValues] = useState<boolean>(false);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [isClientReady, setIsClientReady] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  
  const barRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const histRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const TOP_N = 10;

  const chartRef = useRef<HTMLDivElement>(null);
  const debouncedFreeTextQuery = useDebounce(filters.freeTextQuery, 500);

  // Fetch fields
  useEffect(() => {
    fetch('/api/normalization-fields')
      .then(res => res.json())
      .then(json => {
        setFields(json.fields);
        if (json.fields.length > 0) setFilters(prev => ({ ...prev, selectedField: json.fields[0].key }));
      });
  }, []);

  // Fetch buckets with filters
  useEffect(() => {
    if (!filters.selectedField) return;
    setLoading(true);
    setError(null);
    
    const params = new URLSearchParams();
    params.append('term', filters.selectedField);
    
    // Add date range filters
    if (filters.dateRange.start) params.append('MinAno', filters.dateRange.start);
    if (filters.dateRange.end) params.append('MaxAno', filters.dateRange.end);
    
    // Add advanced filters
    Object.entries(advancedFilters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    
    // Add free text query
    if (filters.freeTextQuery) params.append('q', filters.freeTextQuery);

    fetch(`/api/indices?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        setBuckets(json.termAggregation?.buckets || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Erro ao carregar dados analíticos.');
        setLoading(false);
      });
  }, [filters.selectedField, filters.dateRange, advancedFilters, filters.freeTextQuery]);

  // Free text search
  const performFreeTextSearch = async () => {
    if (!filters.freeTextQuery.trim()) return;
    
    setLoading(true);
    const params = new URLSearchParams();
    params.append('q', filters.freeTextQuery);
    params.append('rpp', '50'); // Get more results for analysis
    
    if (filters.dateRange.start) params.append('MinAno', filters.dateRange.start);
    if (filters.dateRange.end) params.append('MaxAno', filters.dateRange.end);
    
    // Add advanced filters as JSON string
    if (Object.keys(advancedFilters).length > 0) {
      params.append('advancedFilters', JSON.stringify(advancedFilters));
    }

    try {
      const response = await fetch(`/api/advanced-search?${params.toString()}`);
      const results = await response.json();
      setTimeSeriesData(results.map((result: any) => ({
        date: result._source.Data,
        count: result.score,
        timestamp: new Date(result._source.Data).getTime()
      })));
      
      // Analyze the search results for term frequency
      const termAnalysis = analyzeSearchResults(results);
      setBuckets(termAnalysis);
    } catch (err) {
      setError('Erro na pesquisa de texto livre.');
    } finally {
      setLoading(false);
    }
  };

  // Analyze search results for term frequency
  const analyzeSearchResults = (results: SearchResult[]): Bucket[] => {
    const termCounts: Record<string, number> = {};
    
    results.forEach(result => {
      // Extract terms from text fields
      const text = result._source.Texto || '';
      const summary = result._source.Sumário || '';
      const descriptors = result._source.Descritores || '';
      
      // Simple word extraction (you might want to use a more sophisticated approach)
      const words = [...text.split(/\s+/), ...summary.split(/\s+/), ...descriptors.split(/\s+/)]
        .filter(word => word.length > 3) // Filter out short words
        .map(word => word.toLowerCase().replace(/[^\w\s]/g, ''));
      
      words.forEach(word => {
        if (word.length > 3) {
          termCounts[word] = (termCounts[word] || 0) + 1;
        }
      });
    });
    
    return Object.entries(termCounts)
      .map(([key, doc_count]) => ({ key, doc_count }))
      .sort((a, b) => b.doc_count - a.doc_count)
      .slice(0, TOP_N);
  };

  // Export current view to Excel
  const exportToExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.append('term', filters.selectedField);
      
      if (filters.dateRange.start) params.append('MinAno', filters.dateRange.start);
      if (filters.dateRange.end) params.append('MaxAno', filters.dateRange.end);
      
      Object.entries(advancedFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      if (filters.freeTextQuery) params.append('q', filters.freeTextQuery);

      const response = await fetch(`/api/indices.xlsx?${params.toString()}`);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analise_${filters.selectedField}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Erro ao exportar dados.');
    } finally {
      setExporting(false);
    }
  };

  // Import Excel file
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      setImportFile(file);
    } else {
      setError('Por favor, selecione um arquivo Excel válido.');
    }
  };

  const importExcel = async () => {
    if (!importFile) return;
    
    setImporting(true);
    setImportStatus('Enviando arquivo...');
    
    const formData = new FormData();
    formData.append('import', importFile);
    formData.append('doImport', 'true');
    
    try {
      const response = await fetch('/api/excel/run', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        setImportStatus(`Arquivo processado com sucesso. ID: ${result.id}`);
        // Here you would typically fetch the processed data and display it
      } else {
        setError('Erro ao processar arquivo.');
      }
    } catch (err) {
      setError('Erro ao importar arquivo.');
    } finally {
      setImporting(false);
    }
  };

  // Edit record
  const editRecord = (record: any) => {
    setEditingRecord(record);
    // Navigate to edit page or open modal
    router.push(`/editar/${record._source.UUID || record._source.ECLI}`);
  };

  // Get rare values (count = 1)
  const rareValues = buckets.filter(b => b.doc_count === 1);

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
        const searchParams = new URLSearchParams();
        searchParams.append(filters.selectedField, d.key);
        if (filters.dateRange.start) searchParams.append('MinAno', filters.dateRange.start);
        if (filters.dateRange.end) searchParams.append('MaxAno', filters.dateRange.end);
        if (filters.freeTextQuery) searchParams.append('q', filters.freeTextQuery);
        window.open(`/pesquisa?${searchParams.toString()}`, '_blank');
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
  }, [buckets, filters.selectedField, selectedChart, filters.dateRange, filters.freeTextQuery]);

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
      .attr('filter', 'drop-shadow(0px 2px 8px rgba(37,99,235,0.10))')
      .on('click', (event, d) => {
        const searchParams = new URLSearchParams();
        searchParams.append(filters.selectedField, d.data.key);
        if (filters.dateRange.start) searchParams.append('MinAno', filters.dateRange.start);
        if (filters.dateRange.end) searchParams.append('MaxAno', filters.dateRange.end);
        if (filters.freeTextQuery) searchParams.append('q', filters.freeTextQuery);
        window.open(`/pesquisa?${searchParams.toString()}`, '_blank');
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
  }, [buckets, filters.selectedField, selectedChart, filters.dateRange, filters.freeTextQuery]);

  // Timeline Chart (Records over time)
  useEffect(() => {
    if (selectedChart !== 'timeline' || !timelineRef.current) return;
    timelineRef.current.innerHTML = '';
    
    // Fetch timeline data from API
    const fetchTimelineData = async () => {
      try {
        const params = new URLSearchParams();
        params.append('timePeriod', filters.timePeriod);
        
        if (filters.dateRange.start) params.append('MinAno', filters.dateRange.start);
        if (filters.dateRange.end) params.append('MaxAno', filters.dateRange.end);
        
        if (filters.freeTextQuery) params.append('q', filters.freeTextQuery);
        
        Object.entries(advancedFilters).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });

        const response = await fetch(`/api/timeline?${params.toString()}`);
        const timelineData = await response.json();
        
        if (timelineData.length === 0) {
          timelineRef.current!.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">Nenhum dado encontrado para o período selecionado.</div>';
          return;
        }
        
        renderTimelineChart(timelineData);
      } catch (error) {
        console.error('Error fetching timeline data:', error);
        timelineRef.current!.innerHTML = '<div style="text-align: center; padding: 2rem; color: #dc3545;">Erro ao carregar dados temporais.</div>';
      }
    };
    
    const renderTimelineChart = (data: any[]) => {
      const width = 700, height = 300, margin = { top: 30, right: 40, bottom: 40, left: 60 };
      const svg = d3.select(timelineRef.current)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`);
      
      const x = d3.scaleBand()
        .domain(data.map(d => d.date))
        .range([margin.left, width - margin.right])
        .padding(0.1);
      
      const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 100])
        .range([height - margin.bottom, margin.top]);
      
      // Gradient
      const defs = svg.append('defs');
      const gradient = defs.append('linearGradient')
        .attr('id', 'timeline-gradient')
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '0%').attr('y2', '100%');
      gradient.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6');
      gradient.append('stop').attr('offset', '100%').attr('stop-color', '#1d4ed8');
      
      // Bars
      svg.append('g')
        .selectAll('rect')
        .data(data)
        .enter()
        .append('rect')
        .attr('x', d => x(d.date)!)
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => y(0) - y(d.count))
        .attr('fill', 'url(#timeline-gradient)')
        .attr('rx', 4)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          const searchParams = new URLSearchParams();
          searchParams.append('q', `ECLI:(${d.eclis.join(' OR ')})`);
          window.open(`/pesquisa?${searchParams.toString()}`, '_blank');
        })
        .on('mouseover', function(event, d) {
          d3.select(this).attr('opacity', 0.8);
          d3.select(timelineRef.current).select('.tooltip')
            .style('display', 'block')
            .html(`<b>${d.date}</b><br/>${d.count} registros`)
            .style('left', (event.offsetX + 20) + 'px')
            .style('top', (event.offsetY - 10) + 'px');
        })
        .on('mousemove', function(event) {
          d3.select(timelineRef.current).select('.tooltip')
            .style('left', (event.offsetX + 20) + 'px')
            .style('top', (event.offsetY - 10) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this).attr('opacity', 1);
          d3.select(timelineRef.current).select('.tooltip').style('display', 'none');
        });
      
      // Axes
      svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');
      
      svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));
      
      // Title
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', 16)
        .attr('font-weight', 600)
        .text(`Registros por ${filters.timePeriod === 'day' ? 'Dia' : filters.timePeriod === 'week' ? 'Semana' : filters.timePeriod === 'month' ? 'Mês' : 'Ano'}`);
      
      // Tooltip
      d3.select(timelineRef.current)
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
    };
    
    fetchTimelineData();
  }, [selectedChart, filters.dateRange, filters.timePeriod, filters.freeTextQuery, advancedFilters]);

  // Modern Histogram
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
  }, [buckets, filters.selectedField, selectedChart, histData]);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  // --- Filter Handlers ---
  const addFilter = () => {
    setFilters(prev => ({
      ...prev,
      metadataFilters: [
        ...prev.metadataFilters,
        { id: Date.now(), field: 'Decisão', value: '' }
      ]
    }));
  };

  const removeFilter = (idToRemove: number) => {
    setFilters(prev => ({
      ...prev,
      metadataFilters: prev.metadataFilters.filter(f => f.id !== idToRemove)
    }));
  };

  const handleFilterChange = (id: number, key: 'field' | 'value', value: string) => {
    setFilters(prev => ({
      ...prev,
      metadataFilters: prev.metadataFilters.map(f =>
        f.id === id ? { ...f, [key]: value } : f
      )
    }));
  };

  const handleApplyFilters = () => {
    // This triggers the data fetching
    setFetchTrigger(prev => prev + 1);
  };

  // --- Data Fetching Effect ---
  useEffect(() => {
    if (!isClientReady || fetchTrigger === 0) return;

    setLoading(true);
    setError(null);
    setTimeSeriesData([]); // Clear previous data

    const params = new URLSearchParams();
    
    // Add filters to params
    if (filters.dateRange.start) params.append('MinAno', filters.dateRange.start);
    if (filters.dateRange.end) params.append('MaxAno', filters.dateRange.end);
    params.append('timePeriod', filters.timePeriod);

    filters.metadataFilters.forEach(filter => {
      if (filter.field && filter.value) {
        params.append(filter.field, filter.value);
      }
    });

    if (filters.freeTextQuery.trim()) {
      params.append('q', filters.freeTextQuery.trim());
    }
    
    fetch(`/api/timeline?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error(`Erro na resposta da rede: ${res.statusText}`);
        return res.json();
      })
      .then((documents: any[]) => {
        if (!Array.isArray(documents)) {
             throw new Error("Formato de dados inválido recebido do servidor.");
        }
        const countsByDate: Record<string, { count: number; eclis: string[] }> = {};

        documents.forEach(doc => {
          if (!doc || !doc.Data) return;
          const date = new Date(doc.Data);
          let key: string;

          if (filters.timePeriod === 'day') key = date.toISOString().split('T')[0];
          else if (filters.timePeriod === 'week') {
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            key = new Date(date.setDate(diff)).toISOString().split('T')[0];
          } else if (filters.timePeriod === 'month') key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
          else key = `${date.getFullYear()}-01-01`;
          
          if (!countsByDate[key]) countsByDate[key] = { count: 0, eclis: [] };
          countsByDate[key].count++;
          if (doc.ECLI) countsByDate[key].eclis.push(doc.ECLI);
        });

        const formattedData = Object.entries(countsByDate).map(([date, data]) => ({
          date,
          count: data.count,
          timestamp: new Date(date).getTime(),
          eclis: data.eclis
        })).sort((a, b) => a.timestamp - b.timestamp);

        setTimeSeriesData(formattedData);
      })
      .catch((err) => setError('Erro ao carregar dados temporais. ' + err.message))
      .finally(() => setLoading(false));

  }, [fetchTrigger, isClientReady]);

  // Render Time Series Chart
  useEffect(() => {
    if (!chartRef.current || !isClientReady) return;
    chartRef.current.innerHTML = ''; 
    
    if (timeSeriesData.length === 0) return;
    
    const margin = { top: 40, right: 40, bottom: 80, left: 60 };
    const containerWidth = chartRef.current.clientWidth;
    const containerHeight = Math.max(containerWidth / 2, 450); 
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;
    
    const svg = d3.select(chartRef.current)
      .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)
      .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const data = timeSeriesData.map(d => ({
      ...d,
      date: d3.isoParse(d.date) as Date
    }));
    
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date) as [Date, Date])
      .range([0, width]);
    
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) || 1])
      .range([height, 0]).nice();
    
    const line = d3.line<typeof data[0]>()
      .x(d => x(d.date))
      .y(d => y(d.count))
      .curve(d3.curveMonotoneX);
    
    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#2563eb')
      .attr('stroke-width', 2.5)
      .attr('d', line);
    
    svg.selectAll('.dot')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.date))
      .attr('cy', d => y(d.count))
      .attr('r', 5)
      .attr('fill', '#2563eb')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this).attr('r', 7);
      })
      .on('mouseout', function() {
        d3.select(this).attr('r', 5);
      })
      .on('click', (event, d) => {
        const params = new URLSearchParams();
        
        filters.metadataFilters.forEach(filter => {
          if (filter.field && filter.value) {
            params.append(filter.field, filter.value);
          }
        });

        if (filters.freeTextQuery.trim()) {
          params.append('q', filters.freeTextQuery.trim());
        }

        const clickedDate = new Date(d.date);
        let minDate, maxDate;
        
        if (filters.timePeriod === 'day') {
          minDate = clickedDate.toISOString().split('T')[0];
          maxDate = minDate;
        } else if (filters.timePeriod === 'week') {
          const endOfWeek = new Date(clickedDate);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          minDate = clickedDate.toISOString().split('T')[0];
          maxDate = endOfWeek.toISOString().split('T')[0];
        } else if (filters.timePeriod === 'month') {
          const endOfMonth = new Date(clickedDate.getFullYear(), clickedDate.getMonth() + 1, 0);
          minDate = clickedDate.toISOString().split('T')[0];
          maxDate = endOfMonth.toISOString().split('T')[0];
        } else { // year
          const endOfYear = new Date(clickedDate.getFullYear(), 11, 31);
          minDate = clickedDate.toISOString().split('T')[0];
          maxDate = endOfYear.toISOString().split('T')[0];
        }
        
        params.append('MinAno', minDate);
        params.append('MaxAno', maxDate);

        window.open(`/pesquisa?${params.toString()}`, '_blank');
      });
    
    const xAxis = d3.axisBottom(x)
      .ticks(Math.min(data.length, 10))
      .tickFormat((d) => {
          const date = d as Date;
          if (filters.timePeriod === 'day') return d3.timeFormat('%d/%m')(date);
          if (filters.timePeriod === 'week') return d3.timeFormat('%d/%m')(date);
          if (filters.timePeriod === 'month') return d3.timeFormat('%m/%Y')(date);
          return d3.timeFormat('%Y')(date);
      });
    
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");
    
    svg.append('g').call(d3.axisLeft(y));
    
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', -15)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', '600')
      .text("Frequência de Registros ao Longo do Tempo");

  }, [timeSeriesData, isClientReady, filters]); // Re-render chart if data or filters change
  
  if (!isClientReady) return null;

  // --- Render JSX ---
  return (
    <div className="container-fluid px-4">
      <div className="row justify-content-center">
        <div className="col-12">
          <div className="card shadow-sm my-4" style={{border: 'none', background: '#fff'}}>
            <div className="card-body" style={{fontFamily: 'Inter, Arial, sans-serif'}}>
              <h2 className="mb-2" style={{ fontSize: '2rem', fontWeight: 500 }}>Análise de Frequência Temporal</h2>
              <p className="mb-4 text-muted">Esta ferramenta permite analisar a frequência de termos ao longo do tempo, combinando campos de metadados com pesquisa de texto livre.</p>
              
              <div className="row">
                {/* --- Left Sidebar: Controls --- */}
                <div className="col-md-3">
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Tipo de Gráfico</label>
                    <select className="form-select" value="timeline" disabled>
                      <option value="timeline">Frequência Temporal</option>
            </select>
          </div>
                  
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Filtros de Metadados</label>
                    {filters.metadataFilters.map((filter) => (
                      <div key={filter.id} className="d-flex align-items-center mb-2">
                        <select className="form-select form-select-sm me-1" value={filter.field} onChange={e => handleFilterChange(filter.id, 'field', e.target.value)}>
                          {AVAILABLE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        <input type="text" className="form-control form-control-sm" placeholder="Valor" value={filter.value} onChange={e => handleFilterChange(filter.id, 'value', e.target.value)} />
                        <button className="btn btn-sm btn-outline-danger ms-1" onClick={() => removeFilter(filter.id)}>&times;</button>
                      </div>
                    ))}
                    <button className="btn btn-sm btn-outline-primary" onClick={addFilter}>+ Adicionar Filtro</button>
                  </div>

                  <div className="mb-4">
                    <label className="form-label fw-semibold">Pesquisa de Texto Livre</label>
                    <input type="text" className="form-control" placeholder="Termo adicional..." value={filters.freeTextQuery} onChange={e => setFilters(prev => ({ ...prev, freeTextQuery: e.target.value }))} />
                  </div>

                  <div className="mb-4">
                    <label className="form-label fw-semibold">Período Temporal</label>
                    <select className="form-select" value={filters.timePeriod} onChange={e => setFilters(prev => ({ ...prev, timePeriod: e.target.value }))} disabled={loading}>
                      {TIME_PERIODS.map(period => <option key={period.key} value={period.key}>{period.label}</option>)}
            </select>
          </div>

                  <div className="mb-4">
                    <label className="form-label fw-semibold">Intervalo de Datas (Opcional)</label>
                    <div className="mb-2">
                      <input type="date" className="form-control form-control-sm" value={filters.dateRange.start} onChange={e => setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, start: e.target.value } }))} disabled={loading} />
                    </div>
                    <div>
                      <input type="date" className="form-control form-control-sm" value={filters.dateRange.end} onChange={e => setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, end: e.target.value } }))} disabled={loading} />
                    </div>
                    <button className="btn btn-outline-secondary btn-sm mt-2" onClick={() => setFilters(prev => ({ ...prev, dateRange: { start: '', end: '' } }))} disabled={loading}>
                      Limpar Datas
                    </button>
                  </div>

                  <div className="d-grid">
                    <button className="btn btn-primary" onClick={handleApplyFilters} disabled={loading}>
                      {loading ? (
                        <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span className="ms-1">A carregar...</span></>
                      ) : 'Aplicar Filtros'}
                    </button>
                  </div>
                </div>

                {/* --- Main Chart Area --- */}
                <div className="col-md-9">
                  <div style={{width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', minHeight: '450px', position: 'relative'}}>
                    {loading && (
                      <div className="d-flex justify-content-center align-items-center" style={{position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)'}}>
                        <div className="spinner-border text-primary" role="status"><span className="visually-hidden">A carregar...</span></div>
                      </div>
                    )}
                    {error && (
                      <div className="d-flex justify-content-center align-items-center h-100 p-3">
                        <div className="alert alert-danger w-100">{`Erro ao carregar dados: ${error}`}</div>
        </div>
                    )}
                    {!loading && !error && fetchTrigger > 0 && timeSeriesData.length === 0 && (
                       <div className="d-flex justify-content-center align-items-center h-100">
                         <div className="text-muted">Nenhum dado encontrado para os critérios selecionados.</div>
          </div>
        )}
                     <div ref={chartRef} style={{width: '100%', height: '100%'}} />
                  </div>
                </div>
              </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
} 