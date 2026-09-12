import json,re
from pathlib import Path
import numpy as np
checks=[]
for path in sorted(Path('inputs').glob('*trajectory*.csv')):
    match=re.search(r'zeta([0-9.]+)_solver([^.]*)',path.stem)
    z=float(match.group(1)); data=np.genfromtxt(path,delimiter=',',names=True); t=data['t']
    if z<1:
        w=np.sqrt(1-z*z); x=np.exp(-z*t)*(np.cos(w*t)+z/w*np.sin(w*t));v=-np.exp(-z*t)*np.sin(w*t)/w
    elif z==1:
        x=(1+t)*np.exp(-t);v=-t*np.exp(-t)
    else:
        r1=-z+np.sqrt(z*z-1);r2=-z-np.sqrt(z*z-1)
        x=(r2*np.exp(r1*t)-r1*np.exp(r2*t))/(r2-r1)
        v=r1*r2*(np.exp(r1*t)-np.exp(r2*t))/(r2-r1)
    holdout=path.name.startswith('heldout_')
    assert len(t)==(151 if holdout else 121) and t[0]==0 and t[-1]==(15 if holdout else 12) and np.all(np.diff(t)>0)
    reference_error=float(max(np.max(abs(data['x_ref']-x)),np.max(abs(data['v_ref']-v))))
    numerical_error=float(np.max(abs(data['x_num']-x)))
    energy=(data['x_num']**2+data['v_num']**2)/2
    assert np.isfinite(energy).all() and np.max(abs(energy-data['energy']))<1e-12
    assert reference_error<1e-12 and numerical_error<1e-5
    assert float(np.maximum(0,np.diff(energy)).max())<1e-6
    checks.append({'file':path.name,'referenceError':reference_error,'numericalError':numerical_error})
assert 1<=len(checks)<=6
print(json.dumps(checks,indent=2))
Path('artifacts/closed-form-verification.json').write_text(json.dumps(checks,indent=2))
