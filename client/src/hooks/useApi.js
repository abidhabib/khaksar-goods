import { useState, useCallback } from 'react';
import api from '../api/axios.config';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (method, url, data = null, config = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = method === 'get' || method === 'delete'
        ? await api[method](url, config)
        : await api[method](url, data, config);
      setLoading(false);
      return { success: true, data: response.data };
    } catch (err) {
      setLoading(false);
      const message = err.response?.data?.message || err.message || 'Request failed';
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  const get = useCallback((url, config) => request('get', url, null, config), [request]);
  const post = useCallback((url, data, config) => request('post', url, data, config), [request]);
  const put = useCallback((url, data, config) => request('put', url, data, config), [request]);
  const del = useCallback((url, config) => request('delete', url, null, config), [request]);
 
  return { loading, error, get, post, put, del, setError };
};
