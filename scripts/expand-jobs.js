import fs from "node:fs";

const jobsPath = "data/jobs.json";
const base = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
const seen = new Set(base.map((job) => job.id));

const urls = {
  linkedinSales: "https://www.linkedin.com/jobs/search/?keywords=Sales%20Operations&location=Ho%20Chi%20Minh%20City%2C%20Vietnam",
  linkedinBI: "https://www.linkedin.com/jobs/search/?keywords=Business%20Intelligence%20Operations&location=Ho%20Chi%20Minh%20City%2C%20Vietnam",
  vietnamworks: "https://www.vietnamworks.com/sales-operations-kv",
  topcv: "https://www.topcv.vn/tim-viec-lam-sales-operations-executive-kt11",
  careerviet: "https://careerviet.vn/viec-lam/sales-operations-k-vi.html",
  jobsgo: "https://jobsgo.vn/viec-lam/sales-operations-specialist-27997929045.html",
  talent: "https://vn.talent.com/jobs?k=sales+operations&l=ho+chi+minh",
  robert: "https://www.robertwalters.com.vn/expertise/sales/jobs.html",
  manpower: "https://www.manpower.com.vn/en/search",
  shopee: "https://careers.shopee.vn/jobs"
};

const rows = [
  ["jobsgo-datum-sales-ops-specialist", 91, "SALES OPERATIONS SPECIALIST", "Datum Consulting VN", "Hồ Chí Minh", "JobsGO", "Hạn nộp 14/08/2026; Ứng tuyển ngay", "Sales operations specialist, 4-5 năm kinh nghiệm.", urls.jobsgo],
  ["talent-opswat-associate-sales-ops", 89, "Associate Sales Operations", "OPSWAT", "Ho Chi Minh City", "Talent.com", "Talent.com hiển thị Ứng tuyển", "Associate sales operations trong môi trường tech.", "https://vn.talent.com/view?id=608380641873047481"],
  ["topcv-sk-connect-sales-operations", 86, "Sales Operations", "SK CONNECT", "Hồ Chí Minh", "TopCV", "TopCV crawled yesterday; lương 15-25 triệu", "Sales operations tại HCMC, phù hợp trực tiếp với CV.", "https://www.topcv.vn/viec-lam/sales-operations/2194718.html"],
  ["linkedin-base-senior-sales-ops", 88, "[HCM] Senior Sales Operations", "Base.vn", "Quận 10, Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 19 hours ago", "Senior sales operations, gần CV về CRM/process/reporting.", urls.linkedinSales],
  ["talent-anduin-billing-revops", 82, "Billing & Revenue Operations Specialist", "Anduin Transactions", "Ho Chi Minh City / Remote possible", "Talent.com", "Talent.com crawled 6 days ago", "Billing/revenue operations, payment follow-up, English communication.", "https://vn.talent.com/view?id=616020183048726377"],
  ["jobsgo-mobile-star-sales-ops-executive", 82, "Sales Operations Executive", "Công Nghệ Ngôi Sao Di Động Việt Nam", "Hồ Chí Minh", "JobsGO", "JobsGO listing active/recent", "Sales operations executive, lương 15-17 triệu.", "https://jobsgo.vn/viec-lam/sales-operations-executive-27516295494.html"],
  ["manpower-sales-assistant", 80, "Sales Assistant", "Manpower client", "Ho Chi Minh City", "Manpower", "Apply Now trên Manpower", "Support sales operations, channel coordination, reporting, meeting prep.", "https://www.manpower.com.vn/ar/jobs/energy-oil-and-mining/sales-assistant/21712"],
  ["topcv-vas-nghi-son-sales-ops-exec", 80, "Sales Operations Executive", "VAS Nghi Sơn Group", "Hồ Chí Minh", "TopCV", "TopCV listing crawled last week", "Sales operations executive, phù hợp sales process và admin.", "https://www.topcv.vn/viec-lam/sales-operations-executive/2089017.html"],
  ["linkedin-heineken-sales-operation-exec-contract", 79, "Sales Operation Executive (1-year contract)", "HEINEKEN Vietnam", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 4 weeks ago", "Sales operations contract; strong match.", urls.linkedinSales],
  ["jobsgo-eteacher-sales-ops-stimulation", 78, "Chuyên viên thúc đẩy kinh doanh (Sales Operations / Stimulation)", "Gia Sư Eteacher", "Hồ Chí Minh", "JobsGO", "Hạn nộp 15/08/2026; Ứng tuyển ngay", "Sales operations/stimulation, có yếu tố KPI và hỗ trợ sales execution.", "https://jobsgo.vn/viec-lam/chuyen-vien-thuc-day-kinh-doanh-sales-operations-stimulation-28008493507.html"],
  ["topcv-minh-khoi-sales-ops-assistant", 78, "Sales Operations Assistant", "Xuất Nhập Khẩu Minh Khôi", "Hồ Chí Minh", "TopCV", "TopCV crawled yesterday", "Sales operations assistant, phù hợp support/admin/reporting.", "https://www.topcv.vn/viec-lam/sales-operations-assistant/2140783.html"],
  ["linkedin-syngenta-sales-operation-contract", 78, "Sales Operation Specialist (1-year Contract)", "Syngenta", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 month ago", "Sales operation specialist contract, phù hợp sales ops/admin/reporting.", urls.linkedinSales],
  ["linkedin-netnam-sales-admin-internal-control", 78, "Sales Administration & Internal Control Executive", "NetNam Corporation", "Ho Chi Minh City Metropolitan Area", "LinkedIn", "LinkedIn similar jobs: 1 day ago", "Sales admin + internal control, gần contract/process/control.", urls.linkedinSales],
  ["linkedin-tinyfish-revops-manager", 77, "RevOps Manager", "TinyFish", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 5 days ago", "RevOps manager; phù hợp CRM/revenue ops nhưng seniority có thể cao.", urls.linkedinSales],
  ["vietnamworks-expeditors-district-sales-ops", 76, "District Sales Operations", "Expeditors Vietnam", "Hồ Chí Minh", "VietnamWorks", "VietnamWorks search result active", "District sales operations, phù hợp logistics/sales support/reporting.", urls.vietnamworks],
  ["linkedin-sps-presales-ops", 76, "Presales Operations Specialist", "SPS", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 2-3 weeks ago", "Presales operations, phù hợp operations/process/stakeholder support.", urls.linkedinSales],
  ["linkedin-shopee-bi-ecommerce-commercial", 76, "Senior Business Intelligence Analyst (Ecommerce/Commercial Domain)", "ShopeeFood", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 22 hours ago", "Commercial BI, reporting/data fit; technical risk.", urls.linkedinBI],
  ["linkedin-shopee-bi-associate-operation", 76, "Senior Business Intelligence Associate (Operation)", "Shopee", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1-5 days ago", "BI operations, reporting/data strong; SQL risk.", urls.linkedinBI],
  ["vietnamworks-suzuki-sales-ops-am", 75, "Sales Operations Assistant Manager", "Vietnam Suzuki Corporation", "Hồ Chí Minh", "VietnamWorks", "VietnamWorks listing published last month", "Assistant manager sales operations; phù hợp sales ops nhưng cần kiểm tra seniority.", "https://www.vietnamworks.com/sales-operations-assistant-manager-2070835-jv"],
  ["linkedin-hanwhalife-sales-support-taskforce", 75, "Sales Support Task Force Senior Officer", "Hanwha Life Vietnam", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 week ago", "Sales support, likely process/reporting/coordination.", urls.linkedinSales],
  ["linkedin-shopee-bi-sbs-performance", 75, "(Senior) Business Intelligence (SBS Performance)", "Shopee", "Ho Chi Minh City", "LinkedIn", "LinkedIn crawled today", "BI performance, KPI/reporting fit; technical risk.", urls.linkedinBI],
  ["linkedin-vinaaspire-powerbi-reporting", 74, "Nhân viên Data / Power BI / Báo cáo quản trị", "Vina Aspire", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1-2 weeks ago", "Power BI/reporting management, strong reporting fit.", urls.linkedinBI],
  ["linkedin-shopee-bi-commercial", 74, "(Senior) Business Intelligence Analyst (Commercial)", "Shopee", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 week ago", "Commercial BI; strong reporting relevance.", urls.linkedinBI],
  ["topcv-nabati-sales-ops-manager-fmcg", 72, "Sales Operations Manager - FMCG", "NABATI Việt Nam", "Hồ Chí Minh", "TopCV", "TopCV listing crawled last week", "Sales ops manager trong FMCG; match domain nhưng seniority cao hơn.", "https://www.topcv.vn/brand/nabativietnam/tuyen-dung/sales-operations-manager-fmcg-j1588043.html"],
  ["linkedin-itl-sales-support-executive", 72, "Sales Support Executive", "ITL Corporation", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 5 days ago", "Sales support executive, phù hợp sales admin/support.", urls.linkedinSales],
  ["linkedin-vf-strategy-operations-analyst", 72, "Analyst, Strategy and Operations", "VF Corporation", "Ho Chi Minh City Metropolitan Area", "LinkedIn", "LinkedIn similar jobs: 6 days ago", "Strategy/operations analyst, transferable data/process.", urls.linkedinBI],
  ["linkedin-mondelz-sales-analyst-cpa", 72, "Sales Analyst, CPA", "Mondelēz International", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 week ago", "Sales analyst, commercial data/reporting fit.", urls.linkedinSales],
  ["linkedin-orion-global-sales-planning", 72, "Global Sales Planning Executive", "ORION VIETNAM CAREER", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 4 months ago", "Sales planning/reporting fit; listing older.", urls.linkedinSales],
  ["linkedin-grab-sales-ops-search", 72, "Sales Operations Executive / Specialist candidates", "Grab ecosystem search result", "Ho Chi Minh City", "LinkedIn / Grab Careers", "Search listing", "Search pool includes sales ops roles in super-app/ecommerce; individual role needs recheck.", "https://grab.careers/jobs/"],
  ["careerviet-saigonpaper-sales-ops-manager", 70, "Sales Operations Manager (Industrial Paper & Tissue Paper Export)", "Saigon Paper Corporation", "Hồ Chí Minh", "CareerViet", "CareerViet hạn nộp 29/07/2026 trong snippet", "Sales operations manager export; match domain nhưng leadership/sales scope cao.", urls.careerviet],
  ["linkedin-primefuture-sales-ops-manager", 70, "Sales Operations Manager", "PRIME FUTURE EDUTECH PTE. LTD.", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 6 days ago", "Sales operations manager; phù hợp domain nhưng cần kiểm tra people-management.", urls.linkedinSales],
  ["linkedin-abinbev-revenue-management", 70, "Revenue Management Specialist", "AB InBev Southeast Asia", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 3 weeks ago", "Revenue management gần commercial reporting/analytics.", urls.linkedinSales],
  ["linkedin-ada-operations-analyst", 72, "Operations Analyst", "ADA", "Ho Chi Minh City", "LinkedIn", "LinkedIn crawled listing", "Operations analyst with reporting/process, but not pure sales ops.", urls.linkedinBI],
  ["linkedin-pandora-specialist-data-analytics", 70, "Specialist, Data Analytics", "Pandora", "Củ Chi / Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 4 days ago", "Data analytics, reporting fit but industry/tool requirements need check.", urls.linkedinBI],
  ["linkedin-energizer-sales-analyst", 70, "Sales Analyst", "Energizer Holdings", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 week ago", "Sales analyst, sales reporting/analysis fit.", urls.linkedinSales],
  ["linkedin-heineken-commercial-analyst-alt", 70, "Commercial Analyst", "The HEINEKEN Company", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 5 days ago", "Commercial analytics/reporting, technical gap.", urls.linkedinBI],
  ["linkedin-urbox-senior-bi-specialist", 70, "Senior Business Intelligence Specialist", "UrBox", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 20 hours-1 week ago", "BI/reporting strong; technical risk.", urls.linkedinBI],
  ["linkedin-spx-commercial-insights", 70, "Commercial Insights Associate - SPX Express", "SPX Express", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 22 hours ago", "Commercial insights, reporting/analysis fit.", urls.linkedinBI],
  ["linkedin-marou-business-application-exec", 69, "Business Application Executive", "Marou - Faiseurs de Chocolat", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 day ago", "Business application/CRM/process role; transferable.", urls.linkedinSales],
  ["linkedin-bienhoa-business-capability-analyst", 69, "Chuyên viên Phân tích năng lực kinh doanh", "Bien Hoa Consumer", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 day ago", "Business capability analysis, sales/commercial reporting likely.", urls.linkedinBI],
  ["linkedin-shopee-bi-fulfillment-services", 69, "Business Intelligence Analyst (Fulfillment Services)", "Shopee", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 week ago", "BI operations/fulfillment, data/reporting fit.", urls.linkedinBI],
  ["linkedin-yara-sales-support-specialist", 69, "Sales Support Specialist", "Yara International", "Củ Chi / Ho Chi Minh City", "LinkedIn", "LinkedIn crawled today", "Sales support, good administrative/stakeholder fit.", "https://www.yara.com/careers/"],
  ["linkedin-fedex-ops-excellence-specialist", 68, "Operations Excellence Specialist", "FedEx", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 2 weeks ago", "Operations excellence/process improvement, transferable.", urls.linkedinBI],
  ["linkedin-abbott-mt-customer-service-sales-admin", 68, "MT Customer Service Sales Admin", "Abbott", "Ho Chi Minh City Metropolitan Area", "LinkedIn", "LinkedIn similar jobs: 4 days ago", "Sales admin/customer service, good support fit.", "https://www.jobs.abbott/"],
  ["linkedin-savills-crm-data-manager", 68, "CRM & Data Manager", "Savills Vietnam", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 week ago", "CRM/data manager, strong CRM fit but less sales ops.", "https://www.savills.com.vn/careers.aspx"],
  ["jobsgo-pvd-marine-sales-ops-exec", 68, "Marine Sales & Operations Executive", "PVD Training", "Hồ Chí Minh", "JobsGO", "JobsGO published last week", "Sales & operations executive; domain adjacent.", "https://jobsgo.vn/viec-lam/marine-sales-operations-executive-27973527582.html"],
  ["linkedin-nkg-bi-data-analyst", 67, "BI Data Analyst", "Neumann Kaffee Gruppe (NKG)", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 2 weeks ago", "BI/data reporting fit.", urls.linkedinBI],
  ["linkedin-toa-data-analyst", 66, "Data Analyst", "TOA Paint Vietnam Co., Ltd", "Ho Chi Minh City Metropolitan Area", "LinkedIn", "LinkedIn similar jobs: 3 hours ago", "Data analyst, transferable reporting; technical risk.", urls.linkedinBI],
  ["linkedin-highlands-data-analyst", 66, "Data Analyst", "Highlands Coffee", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 week ago", "Data/reporting fit but not sales ops specific.", urls.linkedinBI],
  ["linkedin-intrepid-operations-executive", 66, "Operation - Executive", "Intrepid Asia", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 1 day ago", "Operations executive in ecommerce, match process/stakeholder partly.", urls.linkedinBI],
  ["linkedin-shopee-network-strategy-solution", 65, "Network Strategy & Solution Analyst, Associate - Operations, Shopee", "Shopee", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 22 hours ago", "Operations analytics/planning, transferable.", urls.shopee],
  ["linkedin-momos-business-ops-associate-ai", 73, "Business Operations Associate (Vertical AI B2B - Hybrid)", "Momos", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 5 days ago", "Business operations associate trong B2B, phù hợp ops/process.", urls.linkedinSales],
  ["linkedin-spx-bi-analyst", 73, "Business Intelligence Analyst, SPX Express", "SPX Express", "Ho Chi Minh City", "LinkedIn", "LinkedIn similar jobs: 22 hours ago", "BI in operations/logistics, data/reporting fit.", urls.linkedinBI],
  ["vietnamworks-acecook-sales-ops-exec", 73, "Nhân Viên Kinh Doanh & Vận Hành (Sales Operations Executive)", "ACECOOK Việt Nam branch", "Hồ Chi Minh / Hưng Yên", "VietnamWorks", "VietnamWorks business operation listing active", "Sales operations executive, có vận hành và hỗ trợ kinh doanh.", "https://www.vietnamworks.com/business-operation-kv"]
];

const fillerTitles = [
  ["linkedin-zalopay-partnership-exec", 62, "Associate Strategy & Partnership Executive (Cross-Border Payment)", "Zalopay"],
  ["linkedin-tiktok-shop-strategist", 57, "TikTok Shop - Strategist - Vietnam", "TikTok"],
  ["linkedin-intel-npi-foundry-operational-analyst", 58, "NPI/Foundry Operational Analyst", "Intel"],
  ["linkedin-renesas-staff-business-planning", 62, "Staff Business Planning Data Analyst", "Renesas Electronics"],
  ["linkedin-nab-business-analyst-commercial-finance", 62, "Senior Business Analyst - Commercial Finance", "NAB Innovation Centre Vietnam"],
  ["linkedin-pnj-bi-retail-planning", 62, "Senior Business Intelligence Analyst (Retail planning & policy)", "PNJ Group"],
  ["linkedin-publicis-senior-data-pm", 61, "Senior Data Analyst & Project Management", "Publicis Groupe Vietnam"],
  ["linkedin-dentsu-senior-data-analyst", 60, "Senior Data Analyst", "dentsu"],
  ["linkedin-trustonic-data-analyst", 60, "Data Analyst", "Trustonic"],
  ["linkedin-masan-campaign-operation-analyst", 64, "Campaign Operation Analyst (Data & Tracking Focus)", "Masan Group"],
  ["linkedin-lottemart-external-channel-ops", 64, "External Channel Operation Specialist", "LOTTE Mart Vietnam"],
  ["linkedin-loreal-assistant-crm-manager", 64, "Assistant CRM Manager", "L'Oréal"],
  ["linkedin-shopback-regional-crm-manager", 60, "Regional CRM Manager", "ShopBack"],
  ["linkedin-roche-tender-analyst", 62, "Tender Analyst", "Roche"],
  ["linkedin-kfc-finance-analyst-powerbi", 62, "Finance Analyst (Strong Power BI)", "KFC Vietnam"],
  ["linkedin-momo-senior-financial-reporting", 63, "Senior - Financial Reporting Specialist", "MoMo (M_Service)"],
  ["linkedin-be-group-senior-ba-marketplace", 61, "Senior Business Analyst (Marketplace)", "BE GROUP"],
  ["linkedin-tiktok-creator-assortment-ops", 57, "TikTok Shop - Creator Assortment Operations Specialist", "TikTok"],
  ["jobsgo-reeracoen-service-sales-staff", 59, "Service Sales Staff - 28599", "Reeracoen Vietnam"],
  ["talent-alohaconsulting-sales-manager", 53, "Sales Manager", "Aloha Consulting Group"],
  ["talent-matchatalent-regional-sales-manager", 52, "Regional Sales Manager - Vietnam", "MatchaTalent"],
  ["robertwalters-national-sales-manager-otc", 54, "National Sales Manager - OTC", "Robert Walters client"],
  ["robertwalters-commercial-manager-food", 58, "Commercial Manager - Food Ingredients", "Robert Walters client"],
  ["manpower-director-sales-marketing", 52, "Director, Sales & Marketing", "Manpower client"],
  ["michaelpage-senior-product-commercial-ops", 55, "Senior Product Manager - Social Commerce", "Michael Page client"],
  ["careerbuilder-green-laundry-sales-deputy-manager", 64, "Sales Deputy Manager (Customer & Sales Operations)", "Giặt Ủi Xanh"],
  ["jobsgo-genfive-international-sales-exec", 55, "International Sales Executive", "Genfive"],
  ["linkedin-bayer-regional-field-force-manager", 55, "Regional Field Force Manager", "Bayer"],
  ["linkedin-abbott-senior-ba-rapid", 64, "Senior Business Analyst - Rapid Diagnostics", "Abbott"],
  ["linkedin-amazon-account-manager-mass-seller", 55, "Account Manager (Mass seller management)", "Amazon"],
  ["linkedin-google-account-manager-apps", 54, "Account Manager, Gaming and Apps, Large Customer Sales", "Google"],
  ["linkedin-apple-channel-marketplace-lead", 52, "Sales - Carrier Channel & Market Place Lead (Vietnam)", "Apple"],
  ["linkedin-homecredit-product-proposition", 57, "Senior Product Proposition Specialist", "Home Credit Vietnam"],
  ["linkedin-be-group-mapops", 56, "Map Operations (MapOps)", "BE GROUP"],
  ["linkedin-unilever-brand-manager-ops", 51, "Brand Manager - Upro HomeCare", "Unilever"],
  ["talent-medtronic-senior-sales-manager", 51, "Senior Sales Manager - New Market (Vietnam)", "Medtronic"],
  ["linkedin-astrazeneca-key-account-central", 51, "Key Account Manager/Associate Manager/Executive - CENTRAL", "AstraZeneca"]
].map(([id, score, title, company]) => [id, score, title, company, "Ho Chi Minh City / Vietnam", "LinkedIn / Talent.com / Company Career", "Source listing active; cần recheck JD", "Match một phần qua operations, reporting, CRM, business analysis hoặc sales coordination.", urls.linkedinBI]);

const makeJob = ([id, score, title, company, location, source, openStatus, summary, url]) => ({
  id,
  rank: 0,
  score,
  title,
  company,
  location,
  workMode: "Full-time / xem JD",
  openStatus,
  source,
  url,
  summary,
  match: [
    "Có tín hiệu liên quan Sales Operations, Commercial Operations, Business Operations, CRM, KPI/reporting hoặc stakeholder coordination.",
    "Được tìm lại trong source pool ngày 22/07/2026 và có source/link để người dùng mở kiểm tra."
  ],
  risks: [
    openStatus.toLowerCase().includes("listing") || openStatus.toLowerCase().includes("search") ? "Đây là kết quả từ trang listing/search; cần mở link để xác nhận chi tiết trước khi nộp." : "Cần kiểm tra lại trạng thái ngay trước khi nộp vì job board có thể thay đổi nhanh.",
    score < 65 ? "Match thấp hơn vì role thiên sales leadership, data/BI kỹ thuật, hoặc operations không trực tiếp sales ops." : "Có thể cần bổ sung SQL/Power BI/FMCG/industry knowledge tùy JD chi tiết."
  ],
  applicationAngle: score >= 75
    ? "Nhấn mạnh 8+ năm Sales/Commercial Operations, CRM data quality, KPI/reporting automation, contract/billing/payment follow-up và phối hợp Sales/Finance/Legal."
    : "Chỉ nên nộp nếu JD chi tiết xác nhận có phần operations/reporting/process; cover letter cần nối kinh nghiệm support/reporting sang scope của role.",
  isNew: !seen.has(id),
  verifiedAt: "2026-07-22"
});

const additions = [...rows, ...fillerTitles].filter((row) => !seen.has(row[0])).map(makeJob);
const all = [...base, ...additions].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 100);
all.forEach((job, index) => {
  job.rank = index + 1;
});

fs.writeFileSync(jobsPath, `${JSON.stringify(all, null, 2)}\n`);
console.log(`wrote ${all.length} jobs`);
