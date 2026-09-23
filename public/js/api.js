const API = {
  token: localStorage.getItem('rd_token') || null,
  user: JSON.parse(localStorage.getItem('rd_user') || 'null'),

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('rd_token', token);
    localStorage.setItem('rd_user', JSON.stringify(user));
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('rd_token');
    localStorage.removeItem('rd_user');
    location.reload();
  },

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`/api${path}`, { ...options, headers });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || res.statusText }; }
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status + ' ' + (res.statusText || '')));
    return data;
  },

  get: (p) => API.request(p),
  post: (p, body) => API.request(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: (p, body) => API.request(p, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (p) => API.request(p, { method: 'DELETE' })
};
