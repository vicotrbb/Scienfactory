import type { Study } from '../server/experiments/study';
const common = {
  repeats: 8,
  seed: 9271,
  inputArtifactIds: [],
  requiredOutputs: ['observations.csv'],
};
export const comparisonCases: Study[] = [
  {
    ...common,
    title: 'Signal processing · noisy waveform recovery',
    question:
      'How do moving-average and Savitzky–Golay smoothing compare on a known two-frequency signal?',
    hypothesis:
      'Polynomial smoothing better preserves the high-frequency component at the selected window size.',
    limitations:
      'Synthetic band-limited waveform and additive Gaussian noise, fixed window selected for this benchmark. Eight paired seeds are exploratory, not a general filter ranking.',
    factors: [{ name: 'method', values: ['moving_average', 'savgol'] }],
    metrics: [
      {
        name: 'rmse',
        unit: 'amplitude',
        min: 0,
        max: 1,
        rationale:
          'Root mean squared error against the known waveform, excluding boundary transients.',
      },
    ],
    code: `from scipy.signal import savgol_filter
import pandas as pd
t=np.arange(1024)/256
truth=np.sin(2*np.pi*3*t)+.35*np.sin(2*np.pi*9*t)
noisy=truth+rng.normal(0,.35,len(t))
filtered=np.convolve(noisy,np.ones(21)/21,mode='same') if parameters['method']=='moving_average' else savgol_filter(noisy,21,3)
metrics={'rmse':float(np.sqrt(np.mean((filtered[21:-21]-truth[21:-21])**2)))}
pd.DataFrame({'time':t,'truth':truth,'noisy':noisy,'filtered':filtered}).to_csv('artifacts/observations.csv',index=False)`,
  },
  {
    ...common,
    title: 'Optimization · assignment versus greedy choice',
    question:
      'How does globally optimal assignment compare with sequential greedy allocation on synthetic cost matrices?',
    hypothesis: 'The exact assignment never has higher total cost than greedy allocation.',
    limitations:
      'Eight random 8-by-8 integer matrices. Dynamic programming verifies the global optimum independently. Performance on this finite sample is not a complexity benchmark.',
    factors: [{ name: 'method', values: ['greedy', 'optimal'] }],
    metrics: [
      {
        name: 'cost',
        unit: 'cost units',
        min: 0,
        rationale: 'Sum of selected assignment costs under identical one-to-one constraints.',
      },
      {
        name: 'optimality_gap',
        unit: 'cost units',
        min: 0,
        rationale: 'Cost minus a separately computed exact subset-DP optimum.',
      },
    ],
    code: `from scipy.optimize import linear_sum_assignment
import pandas as pd
cost=rng.integers(1,100,(8,8))
dp={0:0}
for row in range(8):
    nxt={}
    for mask,value in dp.items():
        for col in range(8):
            if not mask&(1<<col):
                new=mask|(1<<col);nxt[new]=min(nxt.get(new,10**9),value+int(cost[row,col]))
    dp=nxt
exact=dp[255]
if parameters['method']=='optimal':
    rows,cols=linear_sum_assignment(cost)
else:
    rows=np.arange(8);available=set(range(8));cols=[]
    for row in rows:
        col=min(available,key=lambda c:(cost[row,c],c));cols.append(col);available.remove(col)
assert len(set(cols))==8
value=int(cost[rows,cols].sum())
if parameters['method']=='optimal': assert value==exact
assert value>=exact
metrics={'cost':value,'optimality_gap':value-exact}
pd.DataFrame(cost).to_csv('artifacts/observations.csv',index=False)`,
  },
  {
    ...common,
    title: 'Mechanics · long-time oscillator energy',
    question:
      'How does energy drift differ between explicit Euler and velocity Verlet at equal step size?',
    hypothesis:
      'Velocity Verlet exhibits substantially smaller energy drift on the harmonic oscillator.',
    limitations:
      'Dimensionless linear oscillator, fixed dt=0.05 and 400 steps. Random initial phase is the paired simulation input; the methods themselves are deterministic.',
    factors: [{ name: 'method', values: ['euler', 'verlet'] }],
    metrics: [
      {
        name: 'energy_drift',
        unit: 'dimensionless energy',
        min: 0,
        rationale: 'Maximum absolute departure from the initial energy 0.5 over saved steps.',
      },
      {
        name: 'displacement_error',
        unit: 'dimensionless displacement',
        min: 0,
        rationale: 'Maximum error against the analytic initial-phase solution at saved times.',
      },
    ],
    code: `import pandas as pd
phase=rng.uniform(0,2*np.pi);x=float(np.cos(phase));v=float(-np.sin(phase));dt=.05
records=[(0,x,v)]
for k in range(400):
    if parameters['method']=='euler': x,v=x+dt*v,v-dt*x
    else:
        half=v-.5*dt*x;x=x+dt*half;v=half-.5*dt*x
    records.append(((k+1)*dt,x,v))
a=np.array(records);energy=(a[:,1]**2+a[:,2]**2)/2;exact=np.cos(a[:,0]+phase)
metrics={'energy_drift':float(np.max(np.abs(energy-.5))),'displacement_error':float(np.max(np.abs(a[:,1]-exact)))}
pd.DataFrame({'time':a[:,0],'x':a[:,1],'v':a[:,2],'reference':exact,'energy':energy}).to_csv('artifacts/observations.csv',index=False)`,
  },
];
