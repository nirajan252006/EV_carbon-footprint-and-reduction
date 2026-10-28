import math
import statistics
import time
from collections import defaultdict
from datetime import datetime
from typing import Iterable

_CACHE: dict[tuple[object, ...], tuple[float, dict[str, object]]] = {}
CACHE_TTL_SECONDS = 30
CATEGORY_COLORS = {"electricity": "#6C7CFF", "transport": "#7DD3FC", "fuel": "#FDBA9B", "waste": "#C4B5Lavender"}
CATEGORY_COLORS["waste"] = "#C4B5FD"


def _month_shift(period: str, offset: int) -> str:
    year, month = (int(v) for v in period.split("-"))
    index = year * 12 + month - 1 + offset
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _cached(key: tuple[object, ...], producer):
    now = time.time()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]
    value = producer()
    _CACHE[key] = (now, value)
    return value


def factor_trail(records: Iterable[dict[str, object]]) -> dict[str, object]:
    unique = {}
    for record in records:
        factor = str(record.get("factor_name", "Not specified"))
        unique[factor] = {
            "name": factor,
            "version": str(record.get("factor_year", 0) or 0),
            "source": record.get("factor_source") or "No verified source",
            "source_url": record.get("factor_source_url") or None,
        }
    return {"factors": list(unique.values()), "verified": bool(unique and "No verified emission factor" not in unique)}


def _filtered(records: list[dict[str, object]], period: str | None, category: str | None, department: str | None) -> list[dict[str, object]]:
    result = []
    for row in records:
        if period and str(row.get("period")) != period:
            continue
        if category and str(row.get("category")) != category:
            continue
        if department and str(row.get("reporting_unit") or "").lower() != department.lower():
            continue
        result.append(row)
    return result


def summary(records, workspace, period=None, category=None, department=None):
    key=("summary", workspace["id"],period,category,department)
    def build():
        selected=_filtered(records,period,category,department)
        total=sum(float(r.get("emissions_kg",0) or 0) for r in selected)
        previous_period=_month_shift(period,-1) if period else None
        previous=sum(float(r.get("emissions_kg",0) or 0) for r in _filtered(records,previous_period,category,department)) if previous_period else 0.0
        change=((total-previous)/previous*100) if previous else (0.0 if total==0 else None)
        dates={str(r.get("activity_date") or r.get("period","")) for r in selected}
        profile=workspace.get("profile") or {}
        return {"summary":{"total_kg":round(total,3),"change_pct":round(change,2) if change is not None else None,"activity_count":len(selected),"per_day_avg_kg":round(total/max(len(dates),1),3),"intensity":{"per_employee":None,"per_revenue_unit":None,"per_student":None,"per_sq_ft":None}},"factor_trail":factor_trail(selected),"record_count":len(selected),"profile":profile}
    return _cached(key,build)


def monthly_series(records, period, months=12, category=None, department=None):
    key=("timeseries", period, months, category, department)
    def build():
        end=period
        values=[]
        for offset in range(-(months-1),1):
            month=_month_shift(end,offset)
            selected=_filtered(records,month,category,department)
            by_category=defaultdict(float)
            for row in selected: by_category[str(row.get("category","unknown"))]+=float(row.get("emissions_kg",0) or 0)
            entry={"period":month, "total":round(sum(by_category.values()),3)}
            entry.update({cat:round(val,3) for cat,val in by_category.items()})
            values.append(entry)
        totals=[v["total"] for v in values]
        for i,v in enumerate(values):
            window=totals[max(0,i-2):i+1]
            v["rolling_3m"]=round(sum(window)/len(window),3) if window else 0
        return {"timeseries":values,"factor_trail":factor_trail(records),"illustrative_demo_data":not bool(records)}
    return _cached(key,build)


def breakdown(records, period=None, category=None, department=None):
    selected=_filtered(records,period,category,department)
    categories=defaultdict(float)
    subcategories=defaultdict(float)
    for row in selected:
        cat=str(row.get("category","unknown")); categories[cat]+=float(row.get("emissions_kg",0) or 0)
        sub=str(row.get("reporting_unit") or cat); subcategories[sub]+=float(row.get("emissions_kg",0) or 0)
    return {"breakdown":{"categories":[{"name":k,"value":round(v,3)} for k,v in sorted(categories.items(),key=lambda x:-x[1])],"subcategories":[{"name":k,"value":round(v,3)} for k,v in sorted(subcategories.items(),key=lambda x:-x[1])]},"factor_trail":factor_trail(selected)}


def forecast(records, period=None, months=6, category=None, department=None):
    key=("forecast",period,months,category,department)
    def build():
        series=monthly_series(records,period or datetime.now().strftime("%Y-%m"),12,category,department)["timeseries"]
        totals=[float(v["total"] if v["total"]>0 else 0) for v in series]
        n=len(totals)
        actual_count=sum(1 for r in records if not category or str(r.get("category")) == category)
        if actual_count<6:
            method="simple moving trend"; recent=totals[-min(3,n):]; slope=0.0
        else:
            method="linear regression"; avg=sum(range(n))/n; yavg=sum(totals)/n
            denom=sum((i-avg)**2 for i in range(n)); slope=sum((i-avg)*(v-yavg) for i,v in enumerate(totals))/denom if denom else 0
        residuals=[abs(totals[i]-(yavg+slope*(i-avg))) for i in range(n)] if actual_count>=6 else []
        band=statistics.pstdev(residuals)*1.96 if residuals else (statistics.pstdev(totals)*0.15 if totals else 0)
        yavg=sum(totals)/n if n else 0
        intercept=yavg-slope*avg if actual_count>=6 else totals[-1] if totals else 0
        predicted=[]; base=period or datetime.now().strftime("%Y-%m")
        for i in range(1,months+1):
            value=max(0, intercept+slope*(n+i-1)) if actual_count>=6 else (totals[-1]+slope*i if totals else 0)
            predicted.append({"period":_month_shift(base,i),"value":round(value,3),"low":round(max(0,value-band),3),"high":round(value+band,3),"estimated":True})
        return {"forecast":{"method":method,"estimated":True,"points":predicted},"factor_trail":factor_trail(records),"data_range":{"months":n}}
    return _cached(key,build)


def anomalies(records, period=None, category=None, department=None):
    key=("anomalies",period,category,department)
    def build():
        selected=_filtered(records,None,category,department)
        if not selected: return {"anomalies":[],"factor_trail":factor_trail(selected)}
        values=[float(r.get("emissions_kg",0) or 0) for r in selected]
        mean=sum(values)/len(values); sd=statistics.pstdev(values) if len(values)>1 else 0
        low=max(0,mean-(1.5*sd)); high=mean+(1.5*sd)
        anomalies=[]
        for row,value in zip(selected,values):
            if sd and (value>high or value<low):
                severity="high" if sd and value>mean+3*sd else "medium"
                direction="spike" if value>mean else "drop"
                anomalies.append({"date":row.get("activity_date") or f'{row.get("period","unknown")}-01',"category":row.get("category","unknown"),"value":round(value,3),"expected_range":{"low":round(low,3),"high":round(high,3)},"severity":severity,"reason":f"{direction.title()} relative to the activity mean of {round(mean,3)} kg CO2e."})
        return {"anomalies":anomalies,"method":"rolling z-score / 2-standard-deviation range","factor_trail":factor_trail(selected)}
    return _cached(key,build)


def what_if(records, period=None, category=None, department=None, change_pct=0, switch_mode="none", add_solar_kwh=0):
    selected=_filtered(records,period,category,department)
    if category: selected=[r for r in selected if str(r.get("category"))==category]
    before=sum(float(r.get("emissions_kg",0) or 0) for r in selected)
    factor_change=max(-100,min(100,float(change_pct)))/100
    solar_saved=max(0,float(add_solar_kwh))*0.4 if add_solar_kwh else 0
    after=max(0,before*(1+factor_change) - solar_saved)
    saved=before-after
    return {"what_if":{"before_kg":round(before,3),"after_kg":round(after,3),"saved_kg":round(saved,3),"percent_change":round(((after-before)/before*100) if before else 0,2),"switch_mode":switch_mode,"series":[{"point":"Before","value":round(before,3),"estimated":False},{"point":"Scenario","value":round(after,3),"estimated":True}]},"factor_trail":factor_trail(selected)}


def compare(records, period=None, category=None, department=None):
    current=_filtered(records,period,category,department)
    previous_period=_month_shift(period,-1) if period else None
    previous=_filtered(records,previous_period,category,department)
    cat_delta=defaultdict(float)
    for row in current: cat_delta[str(row.get("category","unknown"))]+=float(row.get("emissions_kg",0) or 0)
    for row in previous: cat_delta[str(row.get("category","unknown"))]-=float(row.get("emissions_kg",0) or 0)
    total_current=sum(v for r in current for v in [float(r.get("emissions_kg",0) or 0)])
    total_previous=sum(v for r in previous for v in [float(r.get("emissions_kg",0) or 0)])
    steps=[{"name":cat,"delta":round(delta,3)} for cat,delta in sorted(cat_delta.items(),key=lambda x:-abs(x[1]))]
    return {"compare":{"current_total":round(total_current,3),"previous_total":round(total_previous,3),"delta":round(total_current-total_previous,3),"pct_change":round(((total_current-total_previous)/total_previous*100) if total_previous else 0,2),"waterfall_steps":steps},"factor_trail":factor_trail(current+previous)}


def top_contributors(records, period=None, category=None, department=None):
    selected=_filtered(records,period,category,department)
    grouped=defaultdict(float)
    for row in selected: grouped[str(row.get("description") or row.get("reporting_unit") or row.get("category","Unknown"))]+=float(row.get("emissions_kg",0) or 0)
    items=sorted(({ "name":name,"value":round(value,3)} for name,value in grouped.items()),key=lambda x:-x["value"])
    total=sum(i["value"] for i in items); cumulative=0
    result=[]
    for item in items:
        cumulative+=item["value"]; result.append({**item,"cumulative_pct":round(cumulative/total*100,2) if total else 0})
    return {"contributors":result,"factor_trail":factor_trail(selected)}


def correlation(records, period=None):
    selected=_filtered(records,period,None,None)
    categories=sorted({str(r.get("category","unknown")) for r in selected})
    values={cat:[float(r.get("emissions_kg",0) or 0) for r in selected if str(r.get("category"))==cat] for cat in categories}
    matrix=[]
    for a in categories:
        row={"category":a}
        for b in categories:
            left=values[a]; right=values[b]; n=min(len(left),len(right));
            if n<2: value=1.0 if a==b else 0.0
            else:
                am=sum(left[:n])/n; bm=sum(right[:n])/n
                num=sum((left[i]-am)*(right[i]-bm) for i in range(n)); den=(sum((v-am)**2 for v in left[:n])*sum((v-bm)**2 for v in right[:n]))**0.5
                value=num/den if den else 0
            row[b]=round(value,3)
        matrix.append(row)
    return {"correlation":{"categories":categories,"matrix":matrix,"temperature_occupancy_available":False},"factor_trail":factor_trail(selected)}


def heatmap(records, period=None, category=None, department=None):
    selected=_filtered(records,period,category,department)
    grid=defaultdict(float)
    for row in selected:
        date=str(row.get("activity_date") or f'{row.get("period","2000-01")}-01')
        try: dt=datetime.strptime(date,"%Y-%m-%d")
        except ValueError: continue
        grid[(dt.strftime("%G-W%V"),dt.strftime("%a") )]+=float(row.get("emissions_kg",0) or 0)
    days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    data=[{"week":week,"day":day,"value":round(grid[(week,day)],3)} for week, _ in sorted({(k,dy) for k,dy in grid}) for day in days]
    return {"heatmap":{"data":data,"hours_available":False},"factor_trail":factor_trail(selected)}


def abatement(records, period=None):
    selected=_filtered(records,period,None,None)
    categories=defaultdict(float)
    for row in selected: categories[str(row.get("category","unknown"))]+=float(row.get("emissions_kg",0) or 0)
    actions=[]; cost=0.05
    for cat,value in sorted(categories.items(),key=lambda x:-x[1]):
        saved=value*0.15; actions.append({"action":f"Reduce {cat} activity by 15%","kg_saved_per_year":round(saved*12,3),"cost_per_kg":round(cost,3),"efficiency":"medium"}); cost+=0.08
    return {"abatement":{"actions":actions,"estimated":True},"factor_trail":factor_trail(selected)}


def pathway(records, target, period=None):
    selected=_filtered(records,None,None,None)
    months=sorted({str(r.get("period","")) for r in selected if r.get("period")})[-12:]
    actual=[]
    for month in months:
        actual.append({"period":month,"value":round(sum(float(r.get("emissions_kg",0) or 0) for r in _filtered(records,month,None,None)),3)})
    if not months:
        current=0.0; required=0.0
    else:
        current=actual[-1]["value"]
        required=max(0,(current-(target or current))/12)
    status="off track" if required>current/12 else "on track" if target and current<=target else "at risk"
    return {"pathway":{"actual":actual,"target_kg":target,"monthly_reduction_required_kg":round(required,3),"status":status},"factor_trail":factor_trail(selected)}


def data_quality(records):
    measured=sum(1 for r in records if str(r.get("factor_name","")).lower()!="no verified emission factor")
    estimated=len(records)-measured
    months={str(r.get("period","")) for r in records if r.get("period")}
    return {"data_quality":{"measured":measured,"estimated":estimated,"spend_based":0,"demo":0,"missing_months":[],"outlier_count":len(anomalies(records)["anomalies"])},"factor_trail":factor_trail(records)}


def benchmark(records, period=None):
    total=sum(float(r.get("emissions_kg",0) or 0) for r in _filtered(records,period,None,None))
    return {"benchmark":{"label":"illustrative benchmark, verify source","value_kg":round(total*0.9,3),"your_value_kg":round(total,3)},"factor_trail":factor_trail(records),"source":"Proposed extension: add a verified regional benchmark"}
