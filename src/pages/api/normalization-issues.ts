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
    // Get all unique values for the field
    const result = await client.search({
      size: 0,
      aggs: {
        unique_values: {
          terms: {
            field: esField,
            size: 10000 // Adjust this based on your needs
          }
        }
      }
    });

    const buckets = (result.aggregations?.unique_values as AggregationsStringTermsAggregate).buckets;
    if (!Array.isArray(buckets)) {
      return res.status(500).json({ error: 'Invalid aggregation result' });
    }

    // Convert buckets to array of terms with counts
    const terms = buckets.map(bucket => ({
      value: bucket.key as string,
      count: bucket.doc_count
    }));

    return res.json({
      normalization: [], // No clusters, just flat list
      rawTerms: terms
    });
  } catch (error) {
    console.error('Error fetching normalization issues:', error);
    return res.status(500).json({ error: 'Failed to fetch normalization issues' });
  }
}); 