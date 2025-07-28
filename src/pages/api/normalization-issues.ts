import { NextApiRequest, NextApiResponse } from 'next';
import LoggerApi from '@/core/logger-api';
import { authenticatedHandler } from '@/core/user/authenticate';
import { getElasticSearchClient } from '@/core/elasticsearch';
import { AggregationsStringTermsAggregate } from '@elastic/elasticsearch/lib/api/types';

// Map field names to their Elasticsearch field names
const fieldMapping: Record<string, string> = {
  'Descritores': 'Descritores.Show.keyword',
  'Meio Processual': 'Meio Processual.Show.keyword',
  'Decisão': 'Decisão.Show.keyword'
};

export default LoggerApi(async function normalizationIssuesHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const authed = await authenticatedHandler(req);
  if (!authed) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const field = req.query.field as string;

  if (!field) {
    return res.status(400).json({ error: 'Field parameter is required' });
  }

  const esField = fieldMapping[field];
  if (!esField) {
    return res.status(400).json({ error: 'Invalid field' });
  }

  try {
    const client = await getElasticSearchClient();
    const pageSize = parseInt(req.query.size) || 1500;
    const after = req.query.after ? JSON.parse(req.query.after) : undefined;

    const result = await client.search({
      index: 'your_index',
      size: 0,
      aggs: {
        terms_paged: {
          composite: {
            size: pageSize,
            sources: [
              { term: { terms: { field: esField } } }
            ],
            ...(after ? { after } : {})
          }
        }
      }
    });

    const buckets = result.aggregations.terms_paged.buckets;
    const after_key = result.aggregations.terms_paged.after_key || null;

    // Convert buckets to array of terms with counts
    const terms = buckets.map(bucket => ({
      value: bucket.key as string,
      count: bucket.doc_count
    }));

    // After getting allBuckets (the full array of term buckets)
    const page = parseInt(req.query.page) || 1;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pagedBuckets = terms.slice(start, end);

    return res.json({
      normalization: [], // No clusters, just flat list
      rawTerms: terms,
      termAggregation: {
        buckets: pagedBuckets,
        after_key,
        total: terms.length
      }
    });
  } catch (error) {
    console.error('Error fetching normalization issues:', error);
    return res.status(500).json({ error: 'Failed to fetch normalization issues' });
  }
}); 