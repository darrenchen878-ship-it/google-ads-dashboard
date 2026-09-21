import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Download,
  KeyRound,
  LayoutDashboard,
  Layers3,
  LineChart as LineChartIcon,
  PackageSearch,
  RefreshCw,
  Search,
  ShoppingBag
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell
} from "recharts";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function formatCpc(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value || 0
  );
}

function formatCompactMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value || 0);
}

function formatRate(value) {
  return `${((value || 0) * 100).toFixed(2)}%`;
}

function formatMetric(value, key) {
  if (key === "cost") return formatMoney(value);
  if (key === "cpc") return formatCpc(value);
  if (key === "ctr") return formatRate(value);
  if (key === "roas") return `${(value || 0).toFixed(2)}x`;
  return formatNumber(value);
}

function formatDelta(value, inverse = false) {
  if (value === null || value === undefined || Number.isNaN(value)) return "同期 --";
  const adjusted = inverse ? -value : value;
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function valueDelta(current, previous) {
  return previous ? (current - previous) / previous : null;
}

function compareSortValues(left, right) {
  if (typeof left === "string" || typeof right === "string") {
    return String(left ?? "").localeCompare(String(right ?? ""), "zh-CN", { numeric: true });
  }
  return Number(left || 0) - Number(right || 0);
}

function SortHeader({ label, secondary = "", sortKey, sort, onSort, align = "right" }) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`sortable-header ${align === "left" ? "align-left" : ""}`}>
      <button type="button" onClick={() => onSort(sortKey)} title={`按${label}${active && sort.direction === "asc" ? "降序" : "升序"}排列`}>
        <span>{label}{secondary ? <small>{secondary}</small> : null}</span>
        <Icon size={13} />
      </button>
    </th>
  );
}

function MetricCell({ value, previous, metric, inverse = false }) {
  const delta = valueDelta(value || 0, previous || 0);
  const positive = inverse ? delta < 0 : delta > 0;
  const previousLabel = previous === null || previous === undefined ? "--" : formatMetric(previous, metric);
  return (
    <td className="metric-cell">
      <strong>{formatMetric(value, metric)}</strong>
      <span className={positive ? "metric-delta positive" : "metric-delta"}>
        同期 {previousLabel} · {formatDelta(delta)}
      </span>
    </td>
  );
}

function mergeSeries(current = [], previous = []) {
  const max = Math.max(current.length, previous.length);
  return Array.from({ length: max }, (_, index) => ({
    date: current[index]?.date?.slice(5) ?? `D${index + 1}`,
    cost: current[index]?.cost ?? 0,
    previousCost: previous[index]?.cost ?? 0,
    roas: current[index]?.roas ?? 0,
    previousRoas: previous[index]?.roas ?? 0,
    ctr: current[index]?.ctr ?? 0,
    previousCtr: previous[index]?.ctr ?? 0,
    cpc: current[index]?.cpc ?? 0,
    previousCpc: previous[index]?.cpc ?? 0,
    conversionValue: current[index]?.conversionValue ?? 0,
    previousConversionValue: previous[index]?.conversionValue ?? 0
  }));
}

function KpiCard({ icon: Icon, label, value, previous, delta, inverse }) {
  const positive = inverse ? delta < 0 : delta > 0;
  return (
    <section className="kpi-card">
      <div className="kpi-top">
        <span className="icon-box">
          <Icon size={18} />
        </span>
        <span className={positive ? "delta positive" : "delta"}>{formatDelta(delta)}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-previous">同期 {previous}</div>
      <div className="kpi-label">{label}</div>
    </section>
  );
}

function MetricTable({ rows, title, subtitle, idLabel = "名称", toolbar }) {
  const [sort, setSort] = useState({ key: null, direction: "desc" });
  const sortRows = (sortKey) => {
    setSort((current) => current.key === sortKey
      ? { key: current.direction === "asc" ? null : sortKey, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key: sortKey, direction: "desc" });
  };
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((left, right) => {
      const result = compareSortValues(left[sort.key], right[sort.key]);
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, sort]);
  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {toolbar}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortHeader label={idLabel} sortKey="name" sort={sort} onSort={sortRows} align="left" />
              <SortHeader label="Cost" secondary="同期变化" sortKey="cost" sort={sort} onSort={sortRows} />
              <SortHeader label="CTR" secondary="同期变化" sortKey="ctr" sort={sort} onSort={sortRows} />
              <SortHeader label="CPC" secondary="同期变化" sortKey="cpc" sort={sort} onSort={sortRows} />
              <SortHeader label="Conv." secondary="同期变化" sortKey="conversions" sort={sort} onSort={sortRows} />
              <SortHeader label="收入 Value" secondary="同期变化" sortKey="conversionValue" sort={sort} onSort={sortRows} />
              <SortHeader label="ROAS" secondary="同期变化" sortKey="roas" sort={sort} onSort={sortRows} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <span>{row.id}</span>
                </td>
                <MetricCell value={row.cost} previous={row.previous?.cost} metric="cost" />
                <MetricCell value={row.ctr} previous={row.previous?.ctr} metric="ctr" />
                <MetricCell value={row.cpc} previous={row.previous?.cpc} metric="cpc" inverse />
                <MetricCell value={row.conversions} previous={row.previous?.conversions} metric="number" />
                <MetricCell value={row.conversionValue} previous={row.previous?.conversionValue} metric="cost" />
                <MetricCell value={row.roas} previous={row.previous?.roas} metric="roas" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupedCampaignTable({ groups, toolbar }) {
  const [expanded, setExpanded] = useState({});
  const [sort, setSort] = useState({ key: null, direction: "desc" });
  const sortRows = (sortKey) => {
    setSort((current) => current.key === sortKey
      ? { key: current.direction === "asc" ? null : sortKey, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key: sortKey, direction: "desc" });
  };
  const sortedGroups = useMemo(() => {
    const compareRows = (left, right) => {
      if (!sort.key) return 0;
      const result = compareSortValues(left[sort.key], right[sort.key]);
      return sort.direction === "asc" ? result : -result;
    };
    return [...groups]
      .sort(compareRows)
      .map((group) => ({ ...group, children: [...(group.children || [])].sort(compareRows) }));
  }, [groups, sort]);

  function toggleGroup(id) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  function renderRow(row, isGroup = false) {
    return (
      <tr key={isGroup ? `group-${row.id}` : `campaign-${row.id}`} className={isGroup ? "campaign-group-row" : "campaign-child-row"}>
        <td>
          <button
            className="expand-button"
            type="button"
            onClick={isGroup ? () => toggleGroup(row.id) : undefined}
            aria-label={isGroup ? `${expanded[row.id] ? "收起" : "展开"} ${row.name}` : undefined}
          >
            {isGroup ? (expanded[row.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="child-branch" />}
          </button>
          <strong>{row.name}</strong>
          {!isGroup ? <span>{row.id}</span> : null}
        </td>
        <MetricCell value={row.cost} previous={row.previous?.cost} metric="cost" />
        <MetricCell value={row.ctr} previous={row.previous?.ctr} metric="ctr" />
        <MetricCell value={row.cpc} previous={row.previous?.cpc} metric="cpc" inverse />
        <MetricCell value={row.conversions} previous={row.previous?.conversions} metric="number" />
        <MetricCell value={row.conversionValue} previous={row.previous?.conversionValue} metric="cost" />
        <MetricCell value={row.roas} previous={row.previous?.roas} metric="roas" />
      </tr>
    );
  }

  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Campaign 流量数据</h2>
          <p>按买法归类，点击买法可展开查看 Campaign 明细</p>
        </div>
        {toolbar}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortHeader label="买法 / Campaign" sortKey="name" sort={sort} onSort={sortRows} align="left" />
              <SortHeader label="Cost" secondary="同期变化" sortKey="cost" sort={sort} onSort={sortRows} />
              <SortHeader label="CTR" secondary="同期变化" sortKey="ctr" sort={sort} onSort={sortRows} />
              <SortHeader label="CPC" secondary="同期变化" sortKey="cpc" sort={sort} onSort={sortRows} />
              <SortHeader label="Conv." secondary="同期变化" sortKey="conversions" sort={sort} onSort={sortRows} />
              <SortHeader label="收入 Value" secondary="同期变化" sortKey="conversionValue" sort={sort} onSort={sortRows} />
              <SortHeader label="ROAS" secondary="同期变化" sortKey="roas" sort={sort} onSort={sortRows} />
            </tr>
          </thead>
          <tbody>
            {sortedGroups.flatMap((group) => [
              renderRow(group, true),
              ...(expanded[group.id] ? (group.children || []).map((child) => renderRow(child)) : [])
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupedProductTable({ groups, toolbar }) {
  const [expanded, setExpanded] = useState({});
  const [sort, setSort] = useState({ key: null, direction: "desc" });
  const sortRows = (sortKey) => {
    setSort((current) => current.key === sortKey
      ? { key: current.direction === "asc" ? null : sortKey, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key: sortKey, direction: "desc" });
  };
  const sortedGroups = useMemo(() => {
    const compareRows = (left, right) => {
      if (!sort.key) return 0;
      const result = compareSortValues(left[sort.key], right[sort.key]);
      return sort.direction === "asc" ? result : -result;
    };
    return [...groups]
      .sort(compareRows)
      .map((group) => ({ ...group, children: [...(group.children || [])].sort(compareRows) }));
  }, [groups, sort]);

  function toggleGroup(id) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  function renderRow(row, isGroup = false) {
    return (
      <tr key={isGroup ? `feed-${row.id}` : `product-${row.id}`} className={isGroup ? "campaign-group-row" : "campaign-child-row"}>
        <td>
          <button
            className="expand-button"
            type="button"
            onClick={isGroup ? () => toggleGroup(row.id) : undefined}
            aria-label={isGroup ? `${expanded[row.id] ? "收起" : "展开"} ${row.name}` : undefined}
          >
            {isGroup ? (expanded[row.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="child-branch" />}
          </button>
          <strong>{row.name}</strong>
          {!isGroup ? <span>{row.id}</span> : null}
        </td>
        <MetricCell value={row.cost} previous={row.previous?.cost} metric="cost" />
        <MetricCell value={row.ctr} previous={row.previous?.ctr} metric="ctr" />
        <MetricCell value={row.cpc} previous={row.previous?.cpc} metric="cpc" inverse />
        <MetricCell value={row.conversions} previous={row.previous?.conversions} metric="number" />
        <MetricCell value={row.conversionValue} previous={row.previous?.conversionValue} metric="cost" />
        <MetricCell value={row.roas} previous={row.previous?.roas} metric="roas" />
      </tr>
    );
  }

  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Feed 产品明细</h2>
          <p>按 Feed 分组，点击 Shopping 或 PMax 可展开查看全部产品</p>
        </div>
        {toolbar}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortHeader label="Feed / Product" sortKey="name" sort={sort} onSort={sortRows} align="left" />
              <SortHeader label="Cost" secondary="同期变化" sortKey="cost" sort={sort} onSort={sortRows} />
              <SortHeader label="CTR" secondary="同期变化" sortKey="ctr" sort={sort} onSort={sortRows} />
              <SortHeader label="CPC" secondary="同期变化" sortKey="cpc" sort={sort} onSort={sortRows} />
              <SortHeader label="Conv." secondary="同期变化" sortKey="conversions" sort={sort} onSort={sortRows} />
              <SortHeader label="收入 Value" secondary="同期变化" sortKey="conversionValue" sort={sort} onSort={sortRows} />
              <SortHeader label="ROAS" secondary="同期变化" sortKey="roas" sort={sort} onSort={sortRows} />
            </tr>
          </thead>
          <tbody>
            {sortedGroups.flatMap((group) => [
              renderRow(group, true),
              ...(expanded[group.id] ? (group.children || []).map((child) => renderRow(child)) : [])
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MiniMetricChart({ data, metric }) {
  const labels = { cost: "Cost", roas: "ROAS", ctr: "CTR", cpc: "CPC", conversionValue: "Con. Value" };
  const previousKey = `previous${metric[0].toUpperCase()}${metric.slice(1)}`;
  return (
    <div className="mini-chart">
      <div className="mini-chart-title">{labels[metric]}</div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatMetric(value, metric)}
            width={52}
            tick={{ fontSize: 10 }}
          />
          <Tooltip formatter={(value) => formatMetric(value, metric)} />
          <Line type="monotone" dataKey={metric} name="当前" stroke="#f15b2a" strokeWidth={2.2} dot={false} />
          <Line type="monotone" dataKey={previousKey} name="同期" stroke="#64748b" strokeDasharray="4 4" strokeWidth={1.8} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mini-chart-legend">
        <span><i className="legend-current" />当前</span>
        <span><i className="legend-previous" />同期</span>
      </div>
    </div>
  );
}

function ChartPanel({ data, toolbar }) {
  const options = [
    { key: "cost", label: "Cost" },
    { key: "ctr", label: "CTR" },
    { key: "cpc", label: "CPC" },
    { key: "conversionValue", label: "Con. Value" },
    { key: "roas", label: "ROAS" }
  ];

  return (
    <section className="panel chart-panel">
      <div className="panel-title">
        <div>
          <h2>趋势与同期对比</h2>
          <p>五项核心指标同时展示，当前周期 vs 上一等长周期</p>
        </div>
        {toolbar}
      </div>
      <div className="mini-chart-grid">
        {options.map((option) => <MiniMetricChart key={option.key} data={data} metric={option.key} />)}
      </div>
    </section>
  );
}

function ChannelMix({ rows }) {
  const colors = ["#f15b2a", "#ff8a5b", "#f6b39b", "#c7c7c7", "#e5e5e5"];
  const totalCost = rows.reduce((sum, row) => sum + (row.cost || 0), 0);
  const displayRows = rows.map((row) => ({
    ...row,
    name: row.name === "PERFORMANCE_MAX" ? "PMax" : row.name.replace("_", " ")
  }));
  return (
    <section className="panel channel-mix-panel">
      <div className="panel-title">
        <div>
          <h2>买法/渠道结构</h2>
          <p>四个买法的 Cost 分布，以及各买法内部的品牌词 / 非品牌词结构</p>
        </div>
      </div>
      <div className="channel-mix-content">
        <div className="channel-donut">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={displayRows} dataKey="cost" nameKey="name" innerRadius={66} outerRadius={96} paddingAngle={2}>
                {displayRows.map((row, index) => <Cell key={row.id} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => formatMoney(value)} />
            </PieChart>
          </ResponsiveContainer>
          <strong>{formatMoney(totalCost)}</strong>
          <span className="channel-donut-caption">Total Cost</span>
        </div>
        <div className="channel-mix-list">
          {displayRows.map((row, index) => (
            <div className="channel-mix-row" key={row.id}>
              <div className="channel-mix-name">
                <span><i style={{ background: colors[index % colors.length] }} />{row.name}</span>
                <small>
                  品牌词 {formatMoney(row.brand?.cost)} · {formatRate(row.brand?.share)}
                  <b>非品牌词 {formatMoney(row.nonBrand?.cost)} · {formatRate(row.nonBrand?.share)}</b>
                </small>
              </div>
              <strong>{formatMoney(row.cost)}</strong>
              <em>{formatRate(totalCost ? row.cost / totalCost : 0)}</em>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrandMix({ rows, filter }) {
  const colors = ["#f15b2a", "#c9c9c9"];
  const displayRows = filter === "all" ? rows : rows.filter((row) => row.id === filter);
  const tableRows = displayRows.flatMap((row) => [
    row,
    ...(row.channels || []).map((channel) => ({
      ...channel,
      id: `${row.id}::${channel.id}`,
      name: channel.isCampaign
        ? channel.name.replace("*BM | DTC | Search | ", "")
        : channel.name === "PERFORMANCE_MAX"
          ? "PMax"
          : channel.name,
      isChild: true
    }))
  ]);
  const [sort, setSort] = useState({ key: null, direction: "desc" });
  const sortRows = (sortKey) => {
    setSort((current) => current.key === sortKey
      ? { key: current.direction === "asc" ? null : sortKey, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key: sortKey, direction: "desc" });
  };
  const sortedTableRows = useMemo(() => {
    if (!sort.key) return tableRows;
    return [...tableRows].sort((left, right) => {
      const result = compareSortValues(left[sort.key], right[sort.key]);
      return sort.direction === "asc" ? result : -result;
    });
  }, [tableRows, sort]);
  const costTotal = displayRows.reduce((sum, row) => sum + row.cost, 0);
  const valueTotal = displayRows.reduce((sum, row) => sum + row.conversionValue, 0);
  return (
    <section className="panel brand-panel">
      <div className="panel-title">
        <div>
          <h2>品牌词 / 非品牌词</h2>
          <p>按 Campaign 名称是否包含 Brand 识别，当前仅统计 *BM Campaign</p>
        </div>
      </div>
      <div className="brand-layout">
        <div className="brand-table-wrap">
          <table className="brand-table">
            <thead>
            <tr>
                <SortHeader label="词类" sortKey="name" sort={sort} onSort={sortRows} align="left" />
                <SortHeader label="Cost" secondary="同期变化" sortKey="cost" sort={sort} onSort={sortRows} />
                <SortHeader label="Cost 占比" secondary="同期变化" sortKey="costShare" sort={sort} onSort={sortRows} />
                <SortHeader label="CPC" secondary="同期变化" sortKey="cpc" sort={sort} onSort={sortRows} />
                <SortHeader label="CTR" secondary="同期变化" sortKey="ctr" sort={sort} onSort={sortRows} />
                <SortHeader label="收入 Value" secondary="同期变化" sortKey="conversionValue" sort={sort} onSort={sortRows} />
                <SortHeader label="收入占比" secondary="同期变化" sortKey="valueShare" sort={sort} onSort={sortRows} />
                <SortHeader label="ROAS" secondary="同期变化" sortKey="roas" sort={sort} onSort={sortRows} />
              </tr>
            </thead>
            <tbody>
              {sortedTableRows.map((row) => (
                <tr key={row.id}>
                  <td className={row.isChild ? "brand-child-label" : ""}>
                    <strong>{row.name}</strong>
                    {row.isChild ? <span>{row.name === "其他Search产品词" ? "已合并回品类词" : row.isCampaign ? "品牌词 / Search" : `归属：${row.parentId === "brand" ? "品牌词" : "非品牌词"}`}</span> : null}
                  </td>
                  <MetricCell value={row.cost} previous={row.previous?.cost} metric="cost" />
                  <MetricCell value={row.costShare} previous={row.previousCostShare} metric="ctr" />
                  <MetricCell value={row.cpc} previous={row.previous?.cpc} metric="cpc" inverse />
                  <MetricCell value={row.ctr} previous={row.previous?.ctr} metric="ctr" />
                  <MetricCell value={row.conversionValue} previous={row.previous?.conversionValue} metric="cost" />
                  <MetricCell value={row.valueShare} previous={row.previousValueShare} metric="ctr" />
                  <MetricCell value={row.roas} previous={row.previous?.roas} metric="roas" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="brand-charts">
          <div className="donut-card">
            <div className="donut-title">Cost 占比</div>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie
                  data={displayRows}
                  dataKey="cost"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={2}
                >
                  {displayRows.map((row, index) => <Cell key={row.id} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(value)} />
              </PieChart>
            </ResponsiveContainer>
            <strong>{formatMoney(costTotal)}</strong>
            <div className="donut-breakdown">
              {displayRows.map((row, index) => (
                <div className="donut-breakdown-row" key={row.id}>
                  <span className="donut-key">
                    <i style={{ background: colors[index % colors.length] }} />
                    {row.name}
                  </span>
                  <span>{formatCompactMoney(row.cost)} · {formatRate(row.costShare)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="donut-card">
            <div className="donut-title">收入 Value 占比</div>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie
                  data={displayRows}
                  dataKey="conversionValue"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={2}
                >
                  {displayRows.map((row, index) => <Cell key={row.id} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(value)} />
              </PieChart>
            </ResponsiveContainer>
            <strong>{formatMoney(valueTotal)}</strong>
            <div className="donut-breakdown">
              {displayRows.map((row, index) => (
                <div className="donut-breakdown-row" key={row.id}>
                  <span className="donut-key">
                    <i style={{ background: colors[index % colors.length] }} />
                    {row.name}
                  </span>
                  <span>{formatCompactMoney(row.conversionValue)} · {formatRate(row.valueShare)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductTrend({ data }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Shopping Product 流量曲线</h2>
          <p>商品维度 Cost 与 ROAS 变化</p>
        </div>
      </div>
      <div className="chart compact">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="costGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#f15b2a" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#f15b2a" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={formatMoney} width={72} />
            <Tooltip formatter={(value) => formatMoney(value)} />
            <Area type="monotone" dataKey="cost" name="Cost" fill="url(#costGradient)" stroke="#f15b2a" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const navigationItems = [
  { id: "overall", label: "Overall", icon: LayoutDashboard },
  { id: "channels", label: "买法 / Campaign", icon: Layers3 },
  { id: "products", label: "Products", icon: ShoppingBag },
  { id: "search-keywords", label: "Search Keywords", icon: KeyRound }
];

function Sidebar({ view, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <span className="google-logo" aria-label="Google">G</span>
        <div>
          <strong>Google Ads</strong>
          <span>Performance</span>
        </div>
      </div>
      <div className="sidebar-label">工作区</div>
      <nav className="side-nav" aria-label="看板导航">
        {navigationItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={view === id ? "side-nav-item active" : "side-nav-item"}
            onClick={() => onNavigate(id)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="status-dot" />
        <span>数据连接正常</span>
      </div>
    </aside>
  );
}

function KpiGrid({ summary = {}, delta = {} }) {
  const current = summary.current ?? summary;
  const previous = summary.previous ?? {};
  return (
    <section className="kpi-grid">
      <KpiCard icon={CircleDollarSign} label="Cost" value={formatMoney(current.cost)} previous={formatMoney(previous.cost)} delta={delta.cost} />
      <KpiCard icon={Search} label="CTR" value={formatRate(current.ctr)} previous={formatRate(previous.ctr)} delta={delta.ctr} />
      <KpiCard icon={LineChartIcon} label="CPC" value={formatCpc(current.cpc)} previous={formatCpc(previous.cpc)} delta={delta.cpc} inverse />
      <KpiCard icon={CircleDollarSign} label="Con. Value" value={formatMoney(current.conversionValue)} previous={formatMoney(previous.conversionValue)} delta={valueDelta(current.conversionValue, previous.conversionValue)} />
      <KpiCard icon={BarChart3} label="ROAS" value={formatMetric(current.roas, "roas")} previous={formatMetric(previous.roas, "roas")} delta={delta.roas} />
      <KpiCard icon={PackageSearch} label="Conversions" value={formatNumber(current.conversions)} previous={formatNumber(previous.conversions)} delta={delta.conversions} />
    </section>
  );
}

function GroupedKeywordTable({ rows, toolbar }) {
  const [expanded, setExpanded] = useState({});
  const [sort, setSort] = useState({ key: null, direction: "desc" });
  const sortRows = (sortKey) => {
    setSort((current) => current.key === sortKey
      ? { key: current.direction === "asc" ? null : sortKey, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key: sortKey, direction: "desc" });
  };
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((left, right) => {
      const result = compareSortValues(left[sort.key], right[sort.key]);
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, sort]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of sortedRows) {
      const campaignKey = row.campaignId || row.campaignName || "unknown-campaign";
      const groupKey = `${campaignKey}::${row.adGroupId || row.adGroupName || "unknown-ad-group"}`;
      if (!map.has(campaignKey)) {
        map.set(campaignKey, {
          id: campaignKey,
          name: row.campaignName || "Unknown campaign",
          children: [],
          totals: { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
        });
      }
      const campaign = map.get(campaignKey);
      let group = campaign.children.find((item) => item.id === groupKey);
      if (!group) {
        group = {
          id: groupKey,
          name: row.adGroupName || "Unknown ad group",
          children: [],
          totals: { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
        };
        campaign.children.push(group);
      }
      group.children.push(row);
      for (const target of [campaign, group]) {
        target.totals.cost += row.cost || 0;
        target.totals.clicks += row.clicks || 0;
        target.totals.impressions += row.impressions || 0;
        target.totals.conversions += row.conversions || 0;
        target.totals.conversionValue += row.conversionValue || 0;
      }
    }
    const deriveTotals = (item) => {
      const totals = item.totals;
      const row = {
        ...item,
        cost: totals.cost,
        clicks: totals.clicks,
        impressions: totals.impressions,
        conversions: totals.conversions,
        conversionValue: totals.conversionValue,
        ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
        cpc: totals.clicks ? totals.cost / totals.clicks : 0,
        roas: totals.cost ? totals.conversionValue / totals.cost : 0,
        previous: { cost: 0, ctr: 0, cpc: 0, conversions: 0, conversionValue: 0, roas: 0 }
      };
      return {
        ...row,
        children: item.children?.map((child) => (
          child.totals ? deriveTotals(child) : child
        ))
      };
    };
    return [...map.values()].map(deriveTotals);
  }, [sortedRows]);

  function toggle(id) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  function metricCells(row) {
    return <>
      <MetricCell value={row.cost} previous={row.previous?.cost} metric="cost" />
      <MetricCell value={row.ctr} previous={row.previous?.ctr} metric="ctr" />
      <MetricCell value={row.cpc} previous={row.previous?.cpc} metric="cpc" inverse />
      <MetricCell value={row.conversions} previous={row.previous?.conversions} metric="number" />
      <MetricCell value={row.conversionValue} previous={row.previous?.conversionValue} metric="cost" />
      <MetricCell value={row.roas} previous={row.previous?.roas} metric="roas" />
    </>;
  }

  function renderKeyword(row) {
    return <tr key={`keyword-${row.id}`} className="campaign-child-row keyword-detail-row">
      <td>
        <span className="child-branch" />
        <strong>{row.name}</strong>
        <span>{row.matchType || "--"}</span>
      </td>
      <td>{row.matchType || "--"}</td>
      <td>{row.adGroupName || "--"}</td>
      {metricCells(row)}
    </tr>;
  }

  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Search 关键词数据</h2>
          <p>按 Campaign 分组，点击下拉查看广告组和 Search Keyword 明细</p>
        </div>
        {toolbar}
      </div>
      <div className="table-wrap">
        <table className="keyword-table">
          <thead>
            <tr>
              <SortHeader label="Campaign / Keyword" sortKey="campaignName" sort={sort} onSort={sortRows} align="left" />
              <SortHeader label="匹配类型" sortKey="matchType" sort={sort} onSort={sortRows} align="left" />
              <SortHeader label="广告组" sortKey="adGroupName" sort={sort} onSort={sortRows} align="left" />
                <SortHeader label="Cost" secondary="同期变化" sortKey="cost" sort={sort} onSort={sortRows} />
                <SortHeader label="CTR" secondary="同期变化" sortKey="ctr" sort={sort} onSort={sortRows} />
                <SortHeader label="CPC" secondary="同期变化" sortKey="cpc" sort={sort} onSort={sortRows} />
                <SortHeader label="Conv." secondary="同期变化" sortKey="conversions" sort={sort} onSort={sortRows} />
                <SortHeader label="收入 Value" secondary="同期变化" sortKey="conversionValue" sort={sort} onSort={sortRows} />
                <SortHeader label="ROAS" secondary="同期变化" sortKey="roas" sort={sort} onSort={sortRows} />
            </tr>
          </thead>
          <tbody>
            {rows.length ? groups.flatMap((campaign) => [
              <tr key={`keyword-campaign-${campaign.id}`} className="campaign-group-row">
                <td>
                  <button className="expand-button" type="button" onClick={() => toggle(campaign.id)} aria-label={`${expanded[campaign.id] ? "收起" : "展开"} ${campaign.name}`}>
                    {expanded[campaign.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <strong>{campaign.name}</strong>
                </td>
                <td>Search</td>
                <td>{campaign.children.length} 个广告组</td>
                {metricCells(campaign)}
              </tr>,
              ...(expanded[campaign.id] ? campaign.children.flatMap((adGroup) => [
                <tr key={`keyword-ad-group-${adGroup.id}`} className="campaign-child-row campaign-group-row">
                  <td>
                    <button className="expand-button" type="button" onClick={() => toggle(adGroup.id)} aria-label={`${expanded[adGroup.id] ? "收起" : "展开"} ${adGroup.name}`}>
                      {expanded[adGroup.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <strong>{adGroup.name}</strong>
                  </td>
                  <td>广告组</td>
                  <td>{adGroup.children.length} 个关键词</td>
                  {metricCells(adGroup)}
                </tr>,
                ...(expanded[adGroup.id] ? adGroup.children.map(renderKeyword) : [])
              ]) : [])
            ]) : (
              <tr><td colSpan="9" className="empty-cell">暂无 Search 关键词数据，请先在 Google Ads Script 中运行关键词同步。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ViewHeading({ eyebrow, title, description, toolbar }) {
  return (
    <div className="view-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {toolbar}
    </div>
  );
}

function inputDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function App() {
  const initialView = window.location.hash.replace("#", "") || "overall";
  const [range, setRange] = useState("last_30_days");
  const [campaignId, setCampaignId] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [productFeed, setProductFeed] = useState("all");
  const [view, setView] = useState(
    navigationItems.some((item) => item.id === initialView) ? initialView : "overall"
  );
  const initialEnd = inputDate(addDays(new Date(), -1));
  const initialStart = inputDate(addDays(new Date(), -30));
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard(nextRange = range, nextCampaign = campaignId, nextStart = startDate, nextEnd = endDate) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        range: nextRange,
        campaignId: nextCampaign,
        startDate: nextStart,
        endDate: nextEnd
      });
      const response = await fetch(`${API_BASE}/api/dashboard?${params.toString()}`);
      if (!response.ok) throw new Error(await response.text());
      setData(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard(range, campaignId, startDate, endDate);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const next = window.location.hash.replace("#", "");
      if (navigationItems.some((item) => item.id === next)) setView(next);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const summary = data?.summary.current ?? {};
  const delta = data?.summary.delta ?? {};

  function updateRange(event) {
    const nextRange = event.target.value;
    const days = Number(nextRange.match(/\d+/)?.[0] || 30);
    const nextEnd = inputDate(addDays(new Date(), -1));
    const nextStart = inputDate(addDays(new Date(nextEnd), -(days - 1)));
    setRange(nextRange);
    setStartDate(nextStart);
    setEndDate(nextEnd);
    loadDashboard(nextRange, campaignId, nextStart, nextEnd);
  }

  function updateCampaign(event) {
    setCampaignId(event.target.value);
    loadDashboard(range, event.target.value, startDate, endDate);
  }

  function applyDates() {
    if (!startDate || !endDate || startDate > endDate) {
      setError("请选择有效的起止日期。");
      return;
    }
    setRange("custom");
    loadDashboard("custom", campaignId, startDate, endDate);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `google-ads-dashboard-${range}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function navigateView(nextView) {
    setView(nextView);
    window.history.pushState({}, "", `#${nextView}`);
  }

  function renderCampaignSelector() {
    return (
      <label className="inline-select">
        <span>选择 Campaign</span>
        <select value={campaignId} onChange={updateCampaign}>
          <option value="all">全部 *BM Campaign</option>
          {(data?.campaigns ?? []).map((campaign) => (
            <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
          ))}
        </select>
        <ChevronDown size={15} />
      </label>
    );
  }

  function renderView() {
    const currentSummary = data?.summary?.current ?? {};
    const currentDelta = data?.summary?.delta ?? {};
    const campaignSummary = data?.campaignView?.summary?.current ?? {};
    const campaignDelta = data?.campaignView?.summary?.delta ?? {};

    if (view === "channels") {
      const filteredChannelSeries = data?.campaignView?.channelSeries?.[channelFilter] || data?.campaignView?.channelSeries?.all;
      return (
        <>
          <ViewHeading eyebrow="Campaign analytics" title="买法 / Campaign 数据" description="按渠道和 Campaign 查看 Cost、CTR、CPC、ROAS 与同期变化。" />
          <KpiGrid summary={data?.campaignView?.summary} delta={data?.campaignView?.summary?.delta} />
          <ChartPanel
            data={mergeSeries(filteredChannelSeries?.current, filteredChannelSeries?.previous)}
            toolbar={
              <label className="inline-select compact-select">
                <span>趋势查看范围</span>
                <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                  <option value="all">合并显示</option>
                  <option value="SHOPPING">Shopping</option>
                  <option value="PERFORMANCE_MAX">PMax</option>
                  <option value="SEARCH">Search</option>
                  <option value="DEMAND_GEN">Demand Gen</option>
                </select>
                <ChevronDown size={15} />
              </label>
            }
          />
          <ChannelMix rows={data?.campaignView?.byChannel ?? []} />
          <GroupedCampaignTable
            groups={data?.campaignView?.byCampaignGroups ?? []}
            toolbar={renderCampaignSelector()}
          />
        </>
      );
    }

    if (view === "products") {
      const selectedProductView = data?.productViews?.[productFeed] ?? data?.productViews?.all;
      const feedDefinitions = productFeed === "all"
        ? [
            { id: "shopping", name: "SHOPPING", source: data?.productViews?.shopping },
            { id: "pmax", name: "PMax", source: data?.productViews?.pmax }
          ]
        : [{ id: productFeed, name: productFeed === "shopping" ? "SHOPPING" : "PMax", source: selectedProductView }];
      const productGroups = feedDefinitions.map(({ id, name, source }) => ({
        id,
        name,
        ...(source?.summary?.current ?? {}),
        previous: source?.summary?.previous ?? {},
        children: source?.byProduct ?? []
      }));
      return (
        <>
          <ViewHeading
            eyebrow="Product performance"
            title="Products 数据"
            description="统一查看 Shopping 与 PMax Feed 的商品 Cost、CTR、CPC、ROAS 及同期变化。"
            toolbar={
              <label className="inline-select compact-select">
                <span>选择 Feed</span>
                <select value={productFeed} onChange={(event) => setProductFeed(event.target.value)}>
                  <option value="all">合并显示</option>
                  <option value="shopping">Shopping</option>
                  <option value="pmax">PMax</option>
                </select>
                <ChevronDown size={15} />
              </label>
            }
          />
          <KpiGrid summary={selectedProductView?.summary} delta={selectedProductView?.summary?.delta} />
          <ChartPanel data={mergeSeries(selectedProductView?.series?.current, selectedProductView?.series?.previous)} />
          <GroupedProductTable groups={productGroups} toolbar={renderCampaignSelector()} />
        </>
      );
    }

    if (view === "search-keywords") {
      const keywordView = data?.keywordView;
      return (
        <>
          <ViewHeading eyebrow="Search keywords" title="Search Campaign 关键词数据" description="查看 Search 关键词的 Cost、CTR、CPC、ROAS，并与上月同期对比。" />
          <KpiGrid summary={keywordView?.summary} delta={keywordView?.summary?.delta} />
          <ChartPanel data={mergeSeries(keywordView?.series?.current, keywordView?.series?.previous)} />
          <GroupedKeywordTable rows={keywordView?.byKeyword ?? []} toolbar={renderCampaignSelector()} />
        </>
      );
    }

    return (
      <>
        <ViewHeading eyebrow="Account overview" title="Overall" description="全账户 *BM Campaign 的总体表现、品牌结构与渠道分布。" />
        <KpiGrid summary={data?.summary} delta={data?.summary?.delta} />
        <ChartPanel
          data={mergeSeries(
            (brandFilter === "all" ? data?.series?.current : data?.brandSeries?.[brandFilter]?.current),
            (brandFilter === "all" ? data?.series?.previous : data?.brandSeries?.[brandFilter]?.previous)
          )}
          toolbar={
            <label className="inline-select compact-select">
              <span>查看范围</span>
              <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                <option value="all">合并显示</option>
                <option value="brand">仅品牌词</option>
                <option value="non_brand">仅非品牌词</option>
              </select>
              <ChevronDown size={15} />
            </label>
          }
        />
        <BrandMix
          rows={data?.byBrand ?? []}
          filter={brandFilter}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigateView} />
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <span className="topbar-label">Google Ads / Dashboard</span>
            <span className="topbar-period">{data?.range?.current?.start || startDate} 至 {data?.range?.current?.end || endDate}</span>
          </div>
          <div className="controls">
            <label className="select-control">
              <span>快速周期</span>
              <select value={range} onChange={updateRange}>
                <option value="custom">自定义日期</option>
                <option value="last_7_days">近 7 天</option>
                <option value="last_14_days">近 14 天</option>
                <option value="last_30_days">近 30 天</option>
                <option value="last_90_days">近 90 天</option>
              </select>
              <ChevronDown size={16} />
            </label>
            <label className="date-control">
              <CalendarDays size={15} />
              <span>从</span>
              <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setRange("custom"); }} />
            </label>
            <span className="date-separator">到</span>
            <label className="date-control">
              <CalendarDays size={15} />
              <span>至</span>
              <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setRange("custom"); }} />
            </label>
            <button className="apply-button" onClick={applyDates} type="button">应用</button>
            <button className="icon-button" onClick={() => loadDashboard()} title="刷新" type="button"><RefreshCw size={18} /></button>
            <button className="icon-button" onClick={exportJson} title="导出 JSON" disabled={!data} type="button"><Download size={18} /></button>
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}
        {data?.warnings?.map((warning) => <div className="alert" key={warning}>{warning}</div>)}

        {loading && !data ? (
          <section className="loading">加载数据中...</section>
        ) : (
          <>
            {renderView()}
            <footer>
              <span>数据源：{data?.source === "google" ? "Google Ads API" : data?.source === "google-ads-script" ? "Google Ads Script + Sheet" : "Mock"}</span>
              <span>更新时间：{data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "--"}</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
