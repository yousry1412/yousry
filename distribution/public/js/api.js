const Api = (() => {
  async function request(method, url, body) {
    const opts = { method, headers: { ...(window.Context ? Context.headers() : {}) } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch('/api' + url, opts);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* بدون محتوى */
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `خطأ في الاتصال (${res.status})`);
    }
    return data;
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
  };
})();
