import json, platform
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
s=json.load(open('inputs/engineering-results.json'))
E,A=s['E'],s['A'];results=[]
for case in s['per_run']:
 x=np.asarray(case['nodes'],dtype=float);edges=case['edges'];nd=x.size
 K=np.zeros((nd,nd));f=np.zeros(nd);f[-10::3]=-25
 for i,j in edges:
  v=x[j]-x[i];L=np.linalg.norm(v);n=v/L;k=(E*A/L)*np.outer(n,n)
  I=np.arange(3*i,3*i+3);J=np.arange(3*j,3*j+3)
  K[np.ix_(I,I)]+=k;K[np.ix_(J,J)]+=k;K[np.ix_(I,J)]-=k;K[np.ix_(J,I)]-=k
 fixed=np.arange(12);free=np.arange(12,nd);Kf=K[np.ix_(free,free)]
 u=np.zeros(nd);u[free]=np.linalg.solve(Kf,f[free]);ux=u.reshape((-1,3))
 eig=np.linalg.eigvalsh(Kf);assert eig[0]>0
 recovered=np.zeros_like(x);U=0.;maxstrain=0.;volume=0.
 for i,j in edges:
  v=x[j]-x[i];L=np.linalg.norm(v);n=v/L;extension=np.dot(ux[j]-ux[i],n);force=E*A*extension/L
  recovered[i]-=force*n;recovered[j]+=force*n;U+=.5*E*A/L*extension**2;volume+=A*L;maxstrain=max(maxstrain,abs(extension/L))
 residual=(recovered.reshape(-1)-f);r=np.linalg.norm(residual[free])/np.linalg.norm(f)
 reactions=np.zeros(nd);reactions[fixed]=residual[fixed]
 balance=np.linalg.norm(reactions.reshape((-1,3)).sum(0)+f.reshape((-1,3)).sum(0))/np.linalg.norm(f)
 work=float(f@u);energyerr=abs(2*U-work)/abs(work)
 delta=abs(np.mean(ux[-4:,2]));assert abs(delta-abs(case['tip_deflection']))<1e-10
 assert abs(volume-case['material_volume'])<1e-12
 assert r<1e-7 and balance<1e-7 and energyerr<1e-7
 assert np.allclose(np.linalg.solve(Kf,2*f[free]),2*u[free],rtol=1e-9,atol=1e-12)
 assert np.allclose(np.linalg.solve(2*Kf,f[free]),u[free]/2,rtol=1e-9,atol=1e-12)
 results.append(dict(depth=case['h'],tipDeflection=delta,volume=volume,relativeResidual=r,forceBalance=balance,strainEnergy=U,forceDotDisplacement=work,energyRelativeError=energyerr,maxAxialStrain=maxstrain,conditionNumber=float(eig[-1]/eig[0]),smallestEigenvalue=float(eig[0])))
print(json.dumps({'verifiedCases':len(results),'results':results},indent=2),flush=True)
Path('artifacts/verification.json').write_text(json.dumps({'cases':results,'numpy':np.__version__,'python':platform.python_version(),'scope':'Independent matrix assembly and member-force/energy reconstruction. Linear axial-bar model only.'},indent=2))
plt.rcParams.update({'font.family':'STIXGeneral','mathtext.fontset':'stix','font.size':8,'axes.labelsize':8,'xtick.labelsize':7,'ytick.labelsize':7,'axes.linewidth':.6,'lines.linewidth':1.2,'savefig.bbox':'tight','pdf.fonttype':42})
h=np.array([r['depth'] for r in results]);d=np.array([r['tipDeflection'] for r in results])*1000;v=np.array([r['volume'] for r in results])*1000
fig,axes=plt.subplots(2,1,figsize=(3.4,2.7),sharex=True,layout='constrained')
axes[0].semilogy(h,d,'o-',color='#284b6a',markersize=4);axes[0].set_ylabel('Tip deflection (mm)');axes[0].text(.97,.93,'(a)',transform=axes[0].transAxes,ha='right',va='top')
axes[1].plot(h,v,'s-',color='#3f6748',markersize=4);axes[1].set_ylabel(r'Volume ($10^{-3}$ m$^3$)');axes[1].set_xlabel('Truss depth (m)');axes[1].text(.03,.93,'(b)',transform=axes[1].transAxes,ha='left',va='top');axes[1].set_xticks(h)
for ax in axes:
 ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',color='.9',linewidth=.5);ax.set_axisbelow(True)
fig.savefig('artifacts/depth-tradeoff.pdf');fig.savefig('artifacts/depth-tradeoff.png',dpi=240);plt.close(fig)
