document.addEventListener('DOMContentLoaded', () => {
  // --- Constants: Emission Factors (kg CO2e per km) ---
  const FACTORS = {
    road: {
      'none': 0,
      'petrol-medium': 0.192, // Medium petrol car / SUV
      'petrol-small': 0.137,  // Hatchback
      'diesel': 0.171,        // Diesel car
      'hybrid': 0.109,        // Hybrid car
      'electric': 0.047,      // EV (grid charging average)
      'motorbike': 0.113      // Motorcycle
    },
    transit: {
      bus: 0.096,  // local bus
      train: 0.035, // rail
      metro: 0.028  // metro/light rail
    },
    flight: {
      // average distances in km (one-way)
      short_dist: 750,
      medium_dist: 2500,
      long_dist: 8000,
      // emission factors per km
      short_factor: 0.245,
      medium_factor: 0.151,
      long_factor: 0.148,
      // multipliers
      economy: 1.0,
      premium: 1.5,
      business: 2.9,
      first: 4.0
    },
    offsets: {
      tree_absorption: 22 // kg CO2 absorbed per mature tree per year
    }
  };

  // --- State Variables ---
  let chartInstance = null;
  let activeTab = 'road';
  let savedProfiles = [];

  // --- DOM Elements ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // Road inputs
  const vehicleTypeSelect = document.getElementById('road-vehicle-type');
  const roadDistanceSlider = document.getElementById('road-distance');
  const roadDistanceNum = document.getElementById('road-distance-num');
  const roadPassengersSelect = document.getElementById('road-passengers');
  const roadEfficiencyNum = document.getElementById('road-efficiency');
  const vehicleDependentGroups = document.querySelectorAll('.vehicle-dependent');

  // Transit inputs
  const transitBusSlider = document.getElementById('transit-bus');
  const transitBusNum = document.getElementById('transit-bus-num');
  const transitTrainSlider = document.getElementById('transit-train');
  const transitTrainNum = document.getElementById('transit-train-num');
  const transitMetroSlider = document.getElementById('transit-metro');
  const transitMetroNum = document.getElementById('transit-metro-num');

  // Air inputs
  const airShortInput = document.getElementById('air-short');
  const airMediumInput = document.getElementById('air-medium');
  const airLongInput = document.getElementById('air-long');
  const airClassSelect = document.getElementById('air-class');

  // Eco inputs
  const ecoWalkingSlider = document.getElementById('eco-walking');
  const ecoWalkingNum = document.getElementById('eco-walking-num');
  const ecoBikingSlider = document.getElementById('eco-biking');
  const ecoBikingNum = document.getElementById('eco-biking-num');

  // Dashboard results
  const co2TotalText = document.getElementById('co2-total');
  const co2WeeklyText = document.getElementById('co2-weekly');
  const ecoSavingsText = document.getElementById('eco-savings');
  const caloriesBurnedText = document.getElementById('calories-burned');

  // Benchmarks
  const barParis = document.getElementById('bar-paris');
  const barGlobal = document.getElementById('bar-global');
  const barUser = document.getElementById('bar-user');
  const barUserVal = document.getElementById('bar-user-val');

  // Simulator
  const simEvSlider = document.getElementById('sim-ev');
  const simEvVal = document.getElementById('sim-ev-val');
  const simActiveSlider = document.getElementById('sim-active');
  const simActiveVal = document.getElementById('sim-active-val');
  const simReductionText = document.getElementById('sim-reduction');
  const simTreesText = document.getElementById('sim-trees');

  // Save profile and history
  const saveLabelInput = document.getElementById('save-label');
  const saveCalcBtn = document.getElementById('save-calc-btn');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const resetAppBtn = document.getElementById('reset-app-btn');

  // --- Tab Switching ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
      activeTab = targetTab;
    });
  });

  // --- Dual Input Synchronization (Slider <=> Number Input) ---
  function syncInputs(slider, numberInput, callback) {
    slider.addEventListener('input', () => {
      numberInput.value = slider.value;
      if (callback) callback();
    });
    numberInput.addEventListener('input', () => {
      let val = parseFloat(numberInput.value);
      if (isNaN(val)) val = 0;
      slider.value = Math.min(val, slider.max);
      if (callback) callback();
    });
  }

  syncInputs(roadDistanceSlider, roadDistanceNum, updateCalculations);
  syncInputs(transitBusSlider, transitBusNum, updateCalculations);
  syncInputs(transitTrainSlider, transitTrainNum, updateCalculations);
  syncInputs(transitMetroSlider, transitMetroNum, updateCalculations);
  syncInputs(ecoWalkingSlider, ecoWalkingNum, updateCalculations);
  syncInputs(ecoBikingSlider, ecoBikingNum, updateCalculations);

  // --- Counters for Air Travel ---
  document.querySelectorAll('.counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      let val = parseInt(input.value) || 0;
      if (btn.classList.contains('inc')) {
        input.value = val + 1;
      } else if (btn.classList.contains('dec') && val > 0) {
        input.value = val - 1;
      }
      updateCalculations();
    });
  });

  [airShortInput, airMediumInput, airLongInput, airClassSelect].forEach(el => {
    el.addEventListener('input', updateCalculations);
  });

  // --- Dynamic Form Group Toggles ---
  vehicleTypeSelect.addEventListener('change', () => {
    const isNone = vehicleTypeSelect.value === 'none';
    vehicleDependentGroups.forEach(group => {
      if (isNone) {
        group.classList.add('hidden');
      } else {
        group.classList.remove('hidden');
      }
    });
    updateCalculations();
  });

  // --- Calculations Core ---
  function updateCalculations() {
    // 1. Private Vehicle road emissions
    const roadType = vehicleTypeSelect.value;
    const roadDist = parseFloat(roadDistanceNum.value) || 0;
    const roadPassengers = parseInt(roadPassengersSelect.value) || 1;
    let roadFactor = FACTORS.road[roadType] || 0;

    // Optional user vehicle efficiency adjustment (only for Petrol & Diesel cars)
    if (roadType.startsWith('petrol') || roadType === 'diesel') {
      const defaultEff = roadType.startsWith('petrol-medium') ? 9.5 : (roadType === 'diesel' ? 6.5 : 6.0);
      const userEff = parseFloat(roadEfficiencyNum.value) || defaultEff;
      // Adjust emission factor proportionally to efficiency (rough linear approximation)
      roadFactor = roadFactor * (userEff / defaultEff);
    }

    const weeklyRoadEmissions = roadDist * (roadFactor / roadPassengers);
    const annualRoadEmissions = weeklyRoadEmissions * 52;

    // 2. Public Transit emissions
    const busDist = parseFloat(transitBusNum.value) || 0;
    const trainDist = parseFloat(transitTrainNum.value) || 0;
    const metroDist = parseFloat(transitMetroNum.value) || 0;

    const weeklyTransitEmissions = 
      (busDist * FACTORS.transit.bus) + 
      (trainDist * FACTORS.transit.train) + 
      (metroDist * FACTORS.transit.metro);
    const annualTransitEmissions = weeklyTransitEmissions * 52;

    // 3. Air Travel emissions (Note: inputs are annual flights, class multiplier applies)
    const classMult = FACTORS.flight[airClassSelect.value] || 1.0;
    const shortFlights = parseInt(airShortInput.value) || 0;
    const mediumFlights = parseInt(airMediumInput.value) || 0;
    const longFlights = parseInt(airLongInput.value) || 0;

    const annualShortEmissions = shortFlights * FACTORS.flight.short_dist * FACTORS.flight.short_factor * classMult;
    const annualMediumEmissions = mediumFlights * FACTORS.flight.medium_dist * FACTORS.flight.medium_factor * classMult;
    const annualLongEmissions = longFlights * FACTORS.flight.long_dist * FACTORS.flight.long_factor * classMult;

    const annualAirEmissions = annualShortEmissions + annualMediumEmissions + annualLongEmissions;
    const weeklyAirEmissions = annualAirEmissions / 52;

    // 4. Eco / Savings
    const walkingDist = parseFloat(ecoWalkingNum.value) || 0;
    const bikingDist = parseFloat(ecoBikingNum.value) || 0;

    // Calories: walking ~50 kcal/km, biking ~30 kcal/km
    const weeklyCalories = (walkingDist * 50) + (bikingDist * 30);
    // Footprint savings compared to driving petrol-medium car alone
    const weeklySavedEmissions = (walkingDist + bikingDist) * FACTORS.road['petrol-medium'];

    // 5. Totals
    const totalWeeklyEmissions = weeklyRoadEmissions + weeklyTransitEmissions + weeklyAirEmissions;
    const totalAnnualEmissionsKg = totalWeeklyEmissions * 52;
    const totalAnnualEmissionsTonnes = totalAnnualEmissionsKg / 1000;

    // --- Update Dashboard Texts ---
    co2TotalText.innerText = totalAnnualEmissionsTonnes.toFixed(2);
    co2WeeklyText.innerText = totalWeeklyEmissions.toFixed(1);
    ecoSavingsText.innerText = weeklySavedEmissions.toFixed(1);
    caloriesBurnedText.innerText = Math.round(weeklyCalories).toLocaleString();

    // --- Update Benchmark Progress Bars ---
    const targetParis = 2.0;  // t CO2
    const targetGlobal = 4.7; // t CO2
    
    // Scale user footprint compared to benchmarks (max 200% for display)
    const scaleFactor = Math.max(totalAnnualEmissionsTonnes, targetGlobal, targetParis) || 1;
    
    barParis.style.width = `${(targetParis / scaleFactor) * 100}%`;
    barGlobal.style.width = `${(targetGlobal / scaleFactor) * 100}%`;
    barUser.style.width = `${(totalAnnualEmissionsTonnes / scaleFactor) * 100}%`;
    
    barUserVal.innerText = `${totalAnnualEmissionsTonnes.toFixed(2)} t`;

    // --- Update Charts ---
    updateChart(weeklyRoadEmissions, weeklyTransitEmissions, weeklyAirEmissions);

    // --- Run Simulator Updates ---
    updateSimulator(annualRoadEmissions, totalAnnualEmissionsTonnes);
  }

  // --- What-If Offset Simulator ---
  function updateSimulator(annualRoadEmissions, totalAnnualEmissionsTonnes) {
    const evPct = parseFloat(simEvSlider.value) || 0;
    const activePct = parseFloat(simActiveSlider.value) || 0;

    simEvVal.innerText = `${evPct}%`;
    simActiveVal.innerText = `${activePct}%`;

    // Active switch: replaces car travel with biking/walking (0 emissions)
    const roadEmissionsAfterActive = annualRoadEmissions * (1 - (activePct / 100));
    
    // EV switch: replaces remaining car travel with EV factor emissions
    // EV factor is roughly 24% of medium petrol vehicle emissions (0.047 vs 0.192)
    // We compute savings compared to current selection
    const roadType = vehicleTypeSelect.value;
    const curFactor = FACTORS.road[roadType] || 0;
    const evFactor = FACTORS.road['electric'];

    let roadEmissionsAfterEV = roadEmissionsAfterActive;
    if (curFactor > evFactor) {
      // Calculate what portion of the remaining distance emissions are switched to EV
      const evRatio = evPct / 100;
      const reductionFactor = (curFactor - evFactor) / curFactor;
      roadEmissionsAfterEV = roadEmissionsAfterActive - (roadEmissionsAfterActive * evRatio * reductionFactor);
    }

    const simAnnualRoadEmissions = roadEmissionsAfterEV;
    const potentialAnnualReductionKg = Math.max(0, annualRoadEmissions - simAnnualRoadEmissions);
    const potentialAnnualReductionTonnes = potentialAnnualReductionKg / 1000;

    simReductionText.innerText = `${potentialAnnualReductionTonnes.toFixed(2)} t CO₂e`;
    
    const treesEquivalent = Math.round(potentialAnnualReductionKg / FACTORS.offsets.tree_absorption);
    simTreesText.innerText = `${treesEquivalent} Tree${treesEquivalent !== 1 ? 's' : ''}`;
  }

  // Bind Simulator Sliders
  simEvSlider.addEventListener('input', () => {
    updateCalculations();
  });
  simActiveSlider.addEventListener('input', () => {
    updateCalculations();
  });

  // --- Chart.js Configuration & Rendering ---
  function updateChart(roadWeekly, transitWeekly, airWeekly) {
    const total = roadWeekly + transitWeekly + airWeekly;
    const emptyState = document.getElementById('chart-empty-state');
    const canvas = document.getElementById('emissions-chart');

    if (total === 0) {
      canvas.style.display = 'none';
      emptyState.classList.remove('hidden');
      return;
    }

    canvas.style.display = 'block';
    emptyState.classList.add('hidden');

    const chartData = [
      parseFloat(roadWeekly.toFixed(2)),
      parseFloat(transitWeekly.toFixed(2)),
      parseFloat(airWeekly.toFixed(2))
    ];

    if (chartInstance) {
      chartInstance.data.datasets[0].data = chartData;
      chartInstance.update();
    } else {
      const ctx = canvas.getContext('2d');
      chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Road Travel', 'Public Transit', 'Air Travel'],
          datasets: [{
            data: chartData,
            backgroundColor: [
              '#06b6d4', // Cyan
              '#10b981', // Emerald Green
              '#f97316'  // Orange
            ],
            borderColor: '#0b1120',
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#f3f4f6',
                font: {
                  family: 'Outfit',
                  size: 12
                },
                padding: 15
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.raw || 0;
                  const pct = ((val / total) * 100).toFixed(1);
                  return ` ${context.label}: ${val} kg CO₂e (${pct}%)`;
                }
              }
            }
          },
          cutout: '65%'
        }
      });
    }
  }

  // --- CRUD Saved Profiles & LocalStorage ---
  function loadHistory() {
    const stored = localStorage.getItem('aether_profiles');
    if (stored) {
      try {
        savedProfiles = JSON.parse(stored);
      } catch (e) {
        savedProfiles = [];
      }
    }
    renderHistoryList();
  }

  function renderHistoryList() {
    historyList.innerHTML = '';
    if (savedProfiles.length === 0) {
      historyEmpty.classList.remove('hidden');
      return;
    }

    historyEmpty.classList.add('hidden');
    savedProfiles.forEach((profile, index) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      const weeklyEmissions = parseFloat(profile.totalWeekly || 0);
      const annualEmissionsTonnes = (weeklyEmissions * 52) / 1000;

      item.innerHTML = `
        <div class="hist-details">
          <span class="hist-title">${profile.label}</span>
          <span class="hist-meta">
            🚗 ${profile.roadDist}km | 🚆 ${profile.transitDist}km | ✈️ ${profile.flightsCount} flights
          </span>
        </div>
        <div class="hist-value-actions">
          <span class="hist-co2">${annualEmissionsTonnes.toFixed(2)} t/yr</span>
          <button class="btn-danger-icon delete-btn" data-index="${index}" title="Delete profile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      `;

      // Click to load profile
      item.addEventListener('click', (e) => {
        // Prevent trigger if clicking delete button
        if (e.target.closest('.delete-btn')) return;
        loadProfileValues(profile);
      });

      // Bind delete button
      item.querySelector('.delete-btn').addEventListener('click', () => {
        deleteProfile(index);
      });

      historyList.appendChild(item);
    });
  }

  function saveProfile() {
    const label = saveLabelInput.value.trim();
    if (!label) {
      alert('Please enter a descriptive label to save this travel profile.');
      return;
    }

    const roadDist = parseFloat(roadDistanceNum.value) || 0;
    const busDist = parseFloat(transitBusNum.value) || 0;
    const trainDist = parseFloat(transitTrainNum.value) || 0;
    const metroDist = parseFloat(transitMetroNum.value) || 0;
    const shortFlights = parseInt(airShortInput.value) || 0;
    const mediumFlights = parseInt(airMediumInput.value) || 0;
    const longFlights = parseInt(airLongInput.value) || 0;

    // Calculate current weekly emissions
    const roadType = vehicleTypeSelect.value;
    const roadPassengers = parseInt(roadPassengersSelect.value) || 1;
    let roadFactor = FACTORS.road[roadType] || 0;
    if (roadType.startsWith('petrol') || roadType === 'diesel') {
      const defaultEff = roadType.startsWith('petrol-medium') ? 9.5 : (roadType === 'diesel' ? 6.5 : 6.0);
      const userEff = parseFloat(roadEfficiencyNum.value) || defaultEff;
      roadFactor = roadFactor * (userEff / defaultEff);
    }
    const roadEmissions = roadDist * (roadFactor / roadPassengers);

    const transitEmissions = 
      (busDist * FACTORS.transit.bus) + 
      (trainDist * FACTORS.transit.train) + 
      (metroDist * FACTORS.transit.metro);

    const classMult = FACTORS.flight[airClassSelect.value] || 1.0;
    const airAnnual = 
      (shortFlights * FACTORS.flight.short_dist * FACTORS.flight.short_factor +
       mediumFlights * FACTORS.flight.medium_dist * FACTORS.flight.medium_factor +
       longFlights * FACTORS.flight.long_dist * FACTORS.flight.long_factor) * classMult;
    const airEmissions = airAnnual / 52;

    const totalWeekly = roadEmissions + transitEmissions + airEmissions;

    const profile = {
      label,
      vehicleType: vehicleTypeSelect.value,
      roadDist,
      roadPassengers,
      roadEfficiency: roadEfficiencyNum.value,
      busDist,
      trainDist,
      metroDist,
      shortFlights,
      mediumFlights,
      longFlights,
      airClass: airClassSelect.value,
      ecoWalking: ecoWalkingNum.value,
      ecoBiking: ecoBikingNum.value,
      totalWeekly
    };

    savedProfiles.unshift(profile);
    localStorage.setItem('aether_profiles', JSON.stringify(savedProfiles));
    saveLabelInput.value = '';
    renderHistoryList();
  }

  function deleteProfile(index) {
    savedProfiles.splice(index, 1);
    localStorage.setItem('aether_profiles', JSON.stringify(savedProfiles));
    renderHistoryList();
  }

  function loadProfileValues(profile) {
    vehicleTypeSelect.value = profile.vehicleType || 'none';
    // Trigger change event to toggle groups
    vehicleTypeSelect.dispatchEvent(new Event('change'));

    roadDistanceSlider.value = profile.roadDist || 0;
    roadDistanceNum.value = profile.roadDist || 0;
    roadPassengersSelect.value = profile.roadPassengers || 1;
    roadEfficiencyNum.value = profile.roadEfficiency || 7.5;

    transitBusSlider.value = profile.busDist || 0;
    transitBusNum.value = profile.busDist || 0;
    transitTrainSlider.value = profile.trainDist || 0;
    transitTrainNum.value = profile.trainDist || 0;
    transitMetroSlider.value = profile.metroDist || 0;
    transitMetroNum.value = profile.metroDist || 0;

    airShortInput.value = profile.shortFlights || 0;
    airMediumInput.value = profile.mediumFlights || 0;
    airLongInput.value = profile.longFlights || 0;
    airClassSelect.value = profile.airClass || 'economy';

    ecoWalkingSlider.value = profile.ecoWalking || 0;
    ecoWalkingNum.value = profile.ecoWalking || 0;
    ecoBikingSlider.value = profile.ecoBiking || 0;
    ecoBikingNum.value = profile.ecoBiking || 0;

    // Reset simulator
    simEvSlider.value = 0;
    simActiveSlider.value = 0;

    updateCalculations();
  }

  // --- Reset All Dashboard Data ---
  function resetAll() {
    if (confirm('Are you sure you want to reset all current calculator inputs?')) {
      vehicleTypeSelect.value = 'none';
      vehicleTypeSelect.dispatchEvent(new Event('change'));

      const zeroSliders = [
        roadDistanceSlider, transitBusSlider, transitTrainSlider, transitMetroSlider, ecoWalkingSlider, ecoBikingSlider,
        simEvSlider, simActiveSlider
      ];
      const zeroNums = [
        roadDistanceNum, transitBusNum, transitTrainNum, transitMetroNum, ecoWalkingNum, ecoBikingNum
      ];
      
      zeroSliders.forEach(s => s.value = 0);
      zeroNums.forEach(n => n.value = 0);
      
      roadPassengersSelect.value = 1;
      roadEfficiencyNum.value = 7.5;
      
      airShortInput.value = 0;
      airMediumInput.value = 0;
      airLongInput.value = 0;
      airClassSelect.value = 'economy';

      saveLabelInput.value = '';

      updateCalculations();
    }
  }

  // --- Clear Profile History ---
  function clearHistory() {
    if (confirm('Are you sure you want to permanently delete all saved profiles?')) {
      savedProfiles = [];
      localStorage.removeItem('aether_profiles');
      renderHistoryList();
    }
  }

  // --- Event Bindings ---
  saveCalcBtn.addEventListener('click', saveProfile);
  clearHistoryBtn.addEventListener('click', clearHistory);
  resetAppBtn.addEventListener('click', resetAll);

  // --- Initialization ---
  loadHistory();
  // Trigger vehicle change initially to align UI
  vehicleTypeSelect.dispatchEvent(new Event('change'));
  updateCalculations();
});
