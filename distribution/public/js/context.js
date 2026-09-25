const Context = (() => {
  let companies = [];
  let branches = [];
  let companyId = Number(localStorage.getItem('companyId')) || null;
  let branchId = Number(localStorage.getItem('branchId')) || null;

  function persist() {
    if (companyId) localStorage.setItem('companyId', companyId);
    else localStorage.removeItem('companyId');
    if (branchId) localStorage.setItem('branchId', branchId);
    else localStorage.removeItem('branchId');
  }

  async function refreshCompanies() {
    companies = await fetch('/api/companies').then((r) => r.json());
    if (!companyId || !companies.find((c) => c.id === companyId)) {
      companyId = companies[0] ? companies[0].id : null;
    }
    return companies;
  }

  async function refreshBranches() {
    if (!companyId) {
      branches = [];
      branchId = null;
      return branches;
    }
    branches = await fetch('/api/branches', { headers: { 'X-Company-Id': companyId } }).then((r) => r.json());
    if (!branchId || !branches.find((b) => b.id === branchId)) {
      const main = branches.find((b) => b.is_main) || branches[0];
      branchId = main ? main.id : null;
    }
    persist();
    return branches;
  }

  async function init() {
    await refreshCompanies();
    await refreshBranches();
  }

  async function setCompany(id) {
    companyId = Number(id);
    branchId = null;
    await refreshBranches();
  }

  function setBranch(id) {
    branchId = Number(id);
    persist();
  }

  function headers() {
    const h = {};
    if (companyId) h['X-Company-Id'] = companyId;
    if (branchId) h['X-Branch-Id'] = branchId;
    return h;
  }

  return {
    init,
    setCompany,
    setBranch,
    headers,
    refreshCompanies,
    refreshBranches,
    getCompanies: () => companies,
    getBranches: () => branches,
    getCompanyId: () => companyId,
    getBranchId: () => branchId,
    getCompany: () => companies.find((c) => c.id === companyId),
    getBranch: () => branches.find((b) => b.id === branchId),
  };
})();

window.Context = Context;
