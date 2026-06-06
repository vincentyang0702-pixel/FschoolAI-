// Leaderboard.jsx — Geographic hierarchy: University → City → Country → Continent → Global
// Placeholder students are stored here and filtered client-side by the user's location.
// Live data comes from Supabase (leaderboard_opt_in = true).

/* Hallmark · macrostructure: App Shell · tone: luxury-minimal · anchor hue: teal
 * pre-emit critique: P5 H5 E5 S4 R5 V4 */

import { useState, useEffect } from "react";
import { useApp }              from "../context/AppContext";
import { supabase }            from "../api/supabase";

const TIER_COLORS = {
  "Brain Owner": "rgba(196,154,60,0.9)",
  Mastermind:    "rgba(175,130,255,0.85)",
  Scholar:       "rgba(100,220,180,0.85)",
};
function TierBadge({ tier }) {
  const color = TIER_COLORS[tier];
  if (!color) return null;
  return (
    <span style={{
      fontSize: "9px", fontWeight: "600", padding: "2px 6px",
      borderRadius: "8px", letterSpacing: "0.5px",
      background: `${color.replace("0.9", "0.1").replace("0.85", "0.1")}`,
      border: `1px solid ${color.replace("0.9", "0.25").replace("0.85", "0.25")}`,
      color, marginLeft: "5px", flexShrink: 0,
    }}>
      {tier}
    </span>
  );
}

const TABS  = ["University", "City", "Country", "Continent", "Global"];
const SORTS = ["Tokens", "GPA", "Streak", "Study Time"]; // Tokens first = default

const SORT_COL = { GPA: "gpa", Streak: "streak", "Study Time": "study_time", Tokens: "points" };
const SORT_FMT = {
  gpa:        v => v?.toFixed(2) ?? "—",
  streak:     v => v != null ? `${v}d` : "—",
  study_time: v => v != null ? `${v}h` : "—",
  points:     v => v != null ? `${v} pts` : "—",
};

const TIER_ORDER  = ["Basic", "Scholar", "Mastermind", "Brain Owner"];
const TIER_MIN    = { Basic: 0, Scholar: 100, Mastermind: 500, "Brain Owner": 2000 };

function tierProgress(points, tier) {
  const idx      = TIER_ORDER.indexOf(tier ?? "Basic");
  const nextName = TIER_ORDER[idx + 1];
  if (!nextName) return { pct: 1, label: "Max tier reached", nextTier: null };
  const min = TIER_MIN[tier] ?? 0;
  const max = TIER_MIN[nextName];
  const pct = Math.min(Math.max((points - min) / (max - min), 0), 1);
  return { pct, label: `${points - min} / ${max - min} to ${nextName}`, nextTier: nextName };
}

const TAB_FILTER_COL = {
  University: "school",
  City:       "city",
  Country:    "country",
  Continent:  "continent",
  Global:     null,
};

const TAB_SUBLABEL = {
  University: r => r.city ?? r.country ?? null,
  City:       r => r.school ?? null,
  Country:    r => r.city ?? null,
  Continent:  r => r.country ?? null,
  Global:     r => r.school ?? null,
};

const DEFAULT_LOCATION = {
  school:    "University of Toronto",
  city:      "Toronto",
  country:   "Canada",
  continent: "North America",
};

// ── Medal palette ─────────────────────────────────────────────────────────────
const MEDAL = [
  { ring: "rgba(0,210,190,0.65)",    bg: "rgba(0,210,190,0.12)",    text: "rgba(0,210,190,0.95)",    rowBg: "rgba(0,210,190,0.06)",    rowBorder: "rgba(0,210,190,0.22)" },
  { ring: "rgba(185,200,215,0.55)",  bg: "rgba(185,200,215,0.08)",  text: "rgba(195,210,225,0.9)",   rowBg: "rgba(255,255,255,0.03)",  rowBorder: "rgba(185,200,215,0.14)" },
  { ring: "rgba(205,165,75,0.55)",   bg: "rgba(205,165,75,0.1)",    text: "rgba(215,175,85,0.9)",    rowBg: "rgba(205,165,75,0.04)",   rowBorder: "rgba(205,165,75,0.16)" },
];

// ── Avatar colours ────────────────────────────────────────────────────────────
const AVATAR_HUE = [
  "rgba(0,210,190,0.65)",
  "rgba(100,150,255,0.65)",
  "rgba(255,130,100,0.65)",
  "rgba(175,130,255,0.65)",
  "rgba(70,200,130,0.65)",
  "rgba(255,175,50,0.65)",
];

function avatarHue(name = "") {
  const n = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_HUE[n % AVATAR_HUE.length];
}

// ── 35-student placeholder roster ────────────────────────────────────────────
const ALL_PLACEHOLDER_STUDENTS = [
  // University of Toronto (10)
  { id:"p01", name:"Aisha Kamara",      school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.94, streak:31, study_time:312 },
  { id:"p02", name:"Mei Lin",           school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.90, streak:8,  study_time:385 },
  { id:"p03", name:"Fatima Al-Rashid",  school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.88, streak:22, study_time:290 },
  { id:"p04", name:"David Chen",        school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.87, streak:45, study_time:180 },
  { id:"p05", name:"Raj Patel",         school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.83, streak:28, study_time:220 },
  { id:"p06", name:"Sarah MacLeod",     school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.79, streak:12, study_time:340 },
  { id:"p07", name:"Omar Hassan",       school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.76, streak:38, study_time:165 },
  { id:"p08", name:"Emma Walsh",        school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.71, streak:52, study_time:195 },
  { id:"p09", name:"Tyler Brooks",      school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.65, streak:19, study_time:258 },
  { id:"p10", name:"Lucas Silva",       school:"University of Toronto",            city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.62, streak:41, study_time:210 },
  // Other Toronto universities (4)
  { id:"p11", name:"Jordan Kim",        school:"York University",                  city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.89, streak:27, study_time:305 },
  { id:"p12", name:"Priya Singh",       school:"Toronto Metropolitan University",  city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.75, streak:35, study_time:240 },
  { id:"p13", name:"Marcus Thompson",   school:"OCAD University",                  city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.60, streak:18, study_time:175 },
  { id:"p14", name:"Chloe Dubois",      school:"Humber College",                   city:"Toronto",       country:"Canada",    continent:"North America", gpa:3.55, streak:43, study_time:155 },
  // Other Canadian cities (5)
  { id:"p15", name:"Sophie Tremblay",   school:"McGill University",                city:"Montreal",      country:"Canada",    continent:"North America", gpa:3.92, streak:15, study_time:350 },
  { id:"p16", name:"Jake Wilson",       school:"University of British Columbia",   city:"Vancouver",     country:"Canada",    continent:"North America", gpa:3.85, streak:48, study_time:200 },
  { id:"p17", name:"Zara Ahmed",        school:"University of Alberta",            city:"Edmonton",      country:"Canada",    continent:"North America", gpa:3.78, streak:33, study_time:265 },
  { id:"p18", name:"Nathan LeBlanc",    school:"Dalhousie University",             city:"Halifax",       country:"Canada",    continent:"North America", gpa:3.68, streak:26, study_time:195 },
  { id:"p19", name:"Amelia Park",       school:"University of Waterloo",           city:"Waterloo",      country:"Canada",    continent:"North America", gpa:3.96, streak:9,  study_time:420 },
  // USA & Mexico (5)
  { id:"p20", name:"Isabella Rodriguez",school:"MIT",                              city:"Cambridge",     country:"USA",       continent:"North America", gpa:3.98, streak:14, study_time:460 },
  { id:"p21", name:"Ethan Johnson",     school:"Harvard University",               city:"Boston",        country:"USA",       continent:"North America", gpa:3.93, streak:55, study_time:210 },
  { id:"p22", name:"Alex Murphy",       school:"Stanford University",              city:"Palo Alto",     country:"USA",       continent:"North America", gpa:3.86, streak:42, study_time:285 },
  { id:"p23", name:"Naomi Williams",    school:"Johns Hopkins University",         city:"Baltimore",     country:"USA",       continent:"North America", gpa:3.80, streak:21, study_time:330 },
  { id:"p24", name:"Gabriela Flores",   school:"UNAM",                             city:"Mexico City",   country:"Mexico",    continent:"North America", gpa:3.72, streak:29, study_time:245 },
  // Europe (4)
  { id:"p25", name:"Felix Müller",      school:"TU Munich",                        city:"Munich",        country:"Germany",   continent:"Europe",        gpa:3.95, streak:37, study_time:315 },
  { id:"p26", name:"Chiara Romano",     school:"Politecnico di Milano",            city:"Milan",         country:"Italy",     continent:"Europe",        gpa:3.82, streak:50, study_time:270 },
  { id:"p27", name:"Luca Moretti",      school:"Università di Bologna",            city:"Bologna",       country:"Italy",     continent:"Europe",        gpa:3.88, streak:24, study_time:288 },
  { id:"p28", name:"Sofia Andersson",   school:"KTH Royal Institute",              city:"Stockholm",     country:"Sweden",    continent:"Europe",        gpa:3.71, streak:12, study_time:198 },
  // Asia (4)
  { id:"p29", name:"Yuki Tanaka",       school:"University of Tokyo",              city:"Tokyo",         country:"Japan",     continent:"Asia",          gpa:3.97, streak:40, study_time:400 },
  { id:"p30", name:"Li Wei",            school:"Peking University",                city:"Beijing",       country:"China",     continent:"Asia",          gpa:3.91, streak:17, study_time:370 },
  { id:"p31", name:"Arjun Sharma",      school:"National University of Singapore", city:"Singapore",     country:"Singapore", continent:"Asia",          gpa:3.84, streak:62, study_time:230 },
  { id:"p32", name:"Priya Nair",        school:"IIT Bombay",                       city:"Mumbai",        country:"India",     continent:"Asia",          gpa:3.82, streak:19, study_time:256 },
  // Oceania (1)
  { id:"p33", name:"Marcus Webb",       school:"University of Melbourne",          city:"Melbourne",     country:"Australia", continent:"Oceania",        gpa:3.76, streak:15, study_time:224 },
  // Africa (1)
  { id:"p34", name:"Amara Osei",        school:"University of Ghana",              city:"Accra",         country:"Ghana",     continent:"Africa",        gpa:3.65, streak:9,  study_time:172 },
  // South America (1)
  { id:"p35", name:"Diego Fernández",   school:"Universidad de Buenos Aires",      city:"Buenos Aires",  country:"Argentina", continent:"South America", gpa:3.78, streak:32, study_time:295 },
];

export default function Leaderboard() {
  const { userId, userData, tokenSummary } = useApp();
  const [tab,       setTab]     = useState(0);
  const [sort,      setSort]    = useState("Tokens");
  const [mounted,   setMounted] = useState(false);
  const [realRows,  setRealRows]  = useState([]);
  const [lbLoading, setLbLoading] = useState(true);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t); }, []);

  // Fetch real leaderboard data joined with user info
  useEffect(() => {
    async function fetchLb() {
      setLbLoading(true);
      try {
        const { data } = await supabase
          .from("leaderboard")
          .select("user_id, points, tier, users ( name, school, city, country, continent, leaderboard_opt_in )")
          .order("points", { ascending: false })
          .limit(50);
        if (data?.length) {
          setRealRows(data.map(r => ({
            id:        r.user_id,
            name:      r.users?.leaderboard_opt_in === false ? "Anonymous Scholar" : (r.users?.name ?? "Anonymous"),
            school:    r.users?.school    ?? "",
            city:      r.users?.city      ?? "",
            country:   r.users?.country   ?? "",
            continent: r.users?.continent ?? "",
            points:    r.points ?? 0,
            tier:      r.tier   ?? "Basic",
          })));
        }
      } catch { /* table may not exist yet */ }
      setLbLoading(false);
    }
    fetchLb();
  }, []);

  const tabName   = TABS[tab];
  const sortCol   = SORT_COL[sort];
  const filterCol = TAB_FILTER_COL[tabName];

  const loc = {
    school:    userData?.school    ?? DEFAULT_LOCATION.school,
    city:      userData?.city      ?? DEFAULT_LOCATION.city,
    country:   userData?.country   ?? DEFAULT_LOCATION.country,
    continent: userData?.continent ?? DEFAULT_LOCATION.continent,
  };

  // Tokens tab: use real leaderboard rows filtered by tab
  const filterReal = filterCol
    ? realRows.filter(r => r[filterCol] === loc[filterCol])
    : realRows;

  // Legacy tabs (GPA/Streak/Study Time): keep placeholder + meEntry
  const meEntry = userId ? {
    id:         userId,
    name:       userData?.name       ?? "You",
    school:     loc.school,
    city:       loc.city,
    country:    loc.country,
    continent:  loc.continent,
    gpa:        userData?.gpa        ?? null,
    streak:     userData?.streak     ?? 0,
    study_time: userData?.study_time ?? 0,
    points:     tokenSummary?.points ?? 0,
    tier:       tokenSummary?.tier   ?? "Basic",
  } : null;

  const legacyBase  = filterCol ? ALL_PLACEHOLDER_STUDENTS.filter(r => r[filterCol] === loc[filterCol]) : ALL_PLACEHOLDER_STUDENTS;
  const legacyCombined = meEntry ? [...legacyBase, meEntry] : legacyBase;
  const legacyRows  = [...legacyCombined].sort((a, b) => (b[sortCol] ?? 0) - (a[sortCol] ?? 0));

  const rows   = sort === "Tokens" ? filterReal : legacyRows;
  const maxVal = (rows[0]?.[sortCol] ?? rows[0]?.points ?? 1) || 1;

  const scopeLabel = tabName === "Global" ? "Global" : `${tabName}: ${loc[TAB_FILTER_COL[tabName]] ?? "—"}`;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: "4px" }}>
          Leaderboard
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>
          {scopeLabel} · {rows.length} student{rows.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Controls row — scope tabs + sort in one line */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        {/* Scope tabs */}
        <div style={{
          display: "flex", gap: "2px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px", padding: "3px",
          overflowX: "auto",
        }}>
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              style={{
                flex: "1 0 auto",
                background: tab === i ? "rgba(255,255,255,0.09)" : "transparent",
                border: tab === i ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                borderRadius: "9px",
                padding: "7px 10px",
                color: tab === i ? "var(--text-primary)" : "var(--text-dim)",
                fontSize: "12px",
                fontWeight: tab === i ? "600" : "400",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Sort pills */}
        <div style={{ display: "flex", gap: "6px" }}>
          {SORTS.map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              style={{
                background: sort === s ? "rgba(0,210,190,0.1)" : "transparent",
                border: `1px solid ${sort === s ? "rgba(0,210,190,0.3)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "20px",
                padding: "5px 14px",
                color: sort === s ? "rgba(0,210,190,0.9)" : "var(--text-dim)",
                fontSize: "12px",
                fontWeight: sort === s ? "600" : "400",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Pinned "You" card — always visible on Tokens tab */}
      {sort === "Tokens" && tokenSummary && (
        <div style={{
          background: "rgba(196,154,60,0.06)", border: "1px solid rgba(196,154,60,0.25)",
          borderRadius: "var(--radius-card)", padding: "14px 16px", marginBottom: "14px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div>
              <span style={{ color: "#C49A3C", fontSize: "13px", fontWeight: "700" }}>{userData?.name ?? "You"}</span>
              <TierBadge tier={tokenSummary.tier} />
            </div>
            <span style={{ color: "#C49A3C", fontSize: "18px", fontWeight: "700", letterSpacing: "-0.5px" }}>
              {tokenSummary.points} pts
            </span>
          </div>
          {(() => {
            const { pct, label, nextTier } = tierProgress(tokenSummary.points, tokenSummary.tier);
            return nextTier ? (
              <>
                <div style={{ height: "3px", background: "rgba(196,154,60,0.12)", borderRadius: "2px", marginBottom: "5px" }}>
                  <div style={{ height: "100%", background: "#C49A3C", borderRadius: "2px", width: `${pct * 100}%`, transition: "width 0.6s ease" }} />
                </div>
                <p style={{ color: "rgba(196,154,60,0.5)", fontSize: "10px", letterSpacing: "0.3px" }}>{label}</p>
              </>
            ) : (
              <p style={{ color: "rgba(196,154,60,0.6)", fontSize: "10px", letterSpacing: "0.5px" }}>MAX TIER</p>
            );
          })()}
        </div>
      )}

      {/* Empty state for Tokens tab when not enough real data */}
      {sort === "Tokens" && !lbLoading && rows.length < 3 && (
        <div style={{ textAlign: "center", padding: "48px 24px", background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius-card)", border: "1px solid rgba(255,255,255,0.05)", marginBottom: "16px" }}>
          <p style={{ color: "rgba(196,154,60,0.6)", fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>The leaderboard is warming up</p>
          <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>Earn tokens to claim an early spot.</p>
        </div>
      )}

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {rows.flatMap((row, i) => {
            const rank     = i + 1;
            const isTop3   = rank <= 3;
            const isMe     = row.id === userId;
            const sublabel = TAB_SUBLABEL[tabName]?.(row);
            const val      = sort === "Tokens" ? row.points : row[sortCol];
            const barPct   = maxVal > 0 && val != null ? Math.max(8, (val / maxVal) * 100) : 0;
            const medal    = isTop3 ? MEDAL[rank - 1] : null;
            const hue      = avatarHue(row.name ?? "");
            const initial  = (row.name ?? "?")[0].toUpperCase();

            const rowBg     = isMe ? "rgba(0,210,190,0.07)" : medal ? medal.rowBg : "var(--color-surface)";
            const rowBorder = isMe ? "rgba(0,210,190,0.3)"  : medal ? medal.rowBorder : "var(--color-border)";
            const rowShadow = isMe
              ? "0 0 0 1px rgba(0,210,190,0.12), 0 4px 16px rgba(0,210,190,0.06)"
              : "var(--depth-line)";

            const rowEl = (
              <div
                key={row.id}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          isTop3 ? "12px" : "10px",
                  background:   rowBg,
                  border:       `1px solid ${rowBorder}`,
                  borderRadius: "var(--radius-card)",
                  padding:      isTop3 ? "18px 16px" : "13px 14px",
                  opacity:      isMe ? 1 : (rank <= 3 ? 0.92 : 0.72),
                  boxShadow:    rowShadow,
                  transition:   "opacity 0.2s",
                  position:     "relative",
                  overflow:     "hidden",
                }}
              >
                {/* Ambient glow on rank 1 */}
                {rank === 1 && (
                  <div style={{
                    position: "absolute", top: -28, right: -28,
                    width: 100, height: 100,
                    background: "radial-gradient(circle, rgba(0,210,190,0.07) 0%, transparent 70%)",
                    pointerEvents: "none",
                  }} />
                )}

                {/* Rank indicator */}
                {isTop3 ? (
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: medal.bg,
                    border: `1.5px solid ${medal.ring}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: medal.text }}>
                      {rank}
                    </span>
                  </div>
                ) : (
                  <span style={{
                    fontSize: "12px", fontWeight: "600",
                    color: "var(--text-dim)",
                    minWidth: "22px", textAlign: "right",
                    flexShrink: 0,
                  }}>
                    {rank}
                  </span>
                )}

                {/* Avatar with initial */}
                <div style={{
                  width:        isTop3 ? 36 : 30,
                  height:       isTop3 ? 36 : 30,
                  borderRadius: "50%",
                  background:   `radial-gradient(circle at 35% 35%, ${hue}, rgba(0,0,0,0.25))`,
                  border:       `1px solid ${hue}`,
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  flexShrink:   0,
                }}>
                  <span style={{
                    fontSize:   isTop3 ? "14px" : "11px",
                    fontWeight: "700",
                    color:      "#fff",
                  }}>
                    {initial}
                  </span>
                </div>

                {/* Name + sublabel */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                    <p style={{
                      color:         isMe ? "rgba(0,210,190,0.95)" : "var(--text-primary)",
                      fontSize:      isTop3 ? "15px" : "13px",
                      fontWeight:    isTop3 ? "600" : "500",
                      overflow:      "hidden",
                      textOverflow:  "ellipsis",
                      whiteSpace:    "nowrap",
                      letterSpacing: "-0.2px",
                    }}>
                      {row.name ?? "Anonymous"}{isMe ? " · You" : ""}
                    </p>
                    {(sort === "Tokens" && row.tier) && <TierBadge tier={row.tier} />}
                    {(sort !== "Tokens" && isMe && tokenSummary?.tier) && <TierBadge tier={tokenSummary.tier} />}
                  </div>
                  {sublabel && (
                    <p style={{
                      color:        "var(--text-dim)",
                      fontSize:     "11px",
                      marginTop:    "2px",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap",
                    }}>
                      {sublabel}
                    </p>
                  )}
                </div>

                {/* Stat value + relative bar */}
                <div style={{
                  display:        "flex",
                  flexDirection:  "column",
                  alignItems:     "flex-end",
                  flexShrink:     0,
                  gap:            "4px",
                }}>
                  <span style={{
                    fontSize:      isTop3 ? "16px" : "14px",
                    fontWeight:    "700",
                    color:         isMe ? (sort === "Tokens" ? "#C49A3C" : "rgba(0,210,190,0.9)") : "var(--text-primary)",
                    letterSpacing: "-0.3px",
                  }}>
                    {sort === "Tokens" ? SORT_FMT.points(val) : SORT_FMT[sortCol](val)}
                  </span>
                  {val != null && (
                    <div style={{
                      height:       2,
                      borderRadius: 1,
                      background:   "rgba(255,255,255,0.07)",
                      width:        38,
                      overflow:     "hidden",
                    }}>
                      <div style={{
                        width:        `${barPct}%`,
                        height:       "100%",
                        background:   isMe
                          ? "rgba(0,210,190,0.8)"
                          : rank === 1
                          ? "rgba(0,210,190,0.5)"
                          : "rgba(255,255,255,0.28)",
                        borderRadius: 1,
                        transition:   "width 0.5s var(--ease-apple)",
                      }} />
                    </div>
                  )}
                </div>
              </div>
            );

            // Insert a subtle divider between the podium (top 3) and the rest
            if (rank === 4 && rows.length > 3) {
              return [
                <div key="__podium-sep__" style={{
                  height:     "1px",
                  background: "var(--color-border)",
                  margin:     "2px 0",
                }} />,
                rowEl,
              ];
            }
            return rowEl;
          })}
      </div>
    </div>
  );
}
