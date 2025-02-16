require('dotenv').config(); 
const polyline = require('polyline');
const axios = require('axios');
const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_MAPS_API_KEY,
  Promise: Promise
});
console.log(process.env.GOOGLE_MAPS_API_KEY);
const routes = [
  {
    id: 'Kondhwa-Hinjewadi',
    source: 'Kondhwa, Pune, India',
    destination: 'Hinjewadi, Pune, India'
  },
  {
    id: 'Swargate-Katraj',
    source: 'Swargate, Pune, India',
    destination: 'CVW5+RC4, Santosh Nagar, Ambegaon Budruk, Pune, Maharashtra 411046, India'
  },
  {
    id: 'Hinjewadi-Swargate',
    source: 'Hinjewadi, Pune, India',
    destination: 'Swargate, Pune, India'
  }
];

async function calculateTrafficScore(route) {
  try {
    const directions = await googleMapsClient.directions({
      origin: route.source,
      destination: route.destination,
      mode: 'driving',
      departure_time: 'now'
    }).asPromise();

    // const routePoints = directions.json.routes[0].overview_polyline.points;

    const endpoints = [
              '/model/getPotholeData',
              '/complaint/getComplaintData',
              '/event/getEventData',
               '/nearby/spots',
              '/banquethall/getAllBanquetHallsByTime',
              '/garden/get',
              '/hospital/getAllHospitals',
              '/hotel/get',
              '/mall/get',
              '/parkingbuilding/getAllParkingBuildings',
              '/school/getAllSchoolsByTime',
              '/diversion/getAllDiversions',
              '/construction/getAllConstructionProjects',
              '/traffic-status/getTrafficStatus'
            ];

    // const responses = await Promise.all(endpoints.map(endpoint => fetchData(endpoint, route.id, routePoints)));


    // Decode polyline to get route points
    const encodedPolyline = directions.json.routes[0].overview_polyline.points;
    const routePoints = polyline.decode(encodedPolyline).map(([lat, lng]) => ({ lat, lng }));

    const responses = await Promise.all(endpoints.map(endpoint => fetchData(endpoint, route.id, routePoints)));



    if (!Array.isArray(routePoints) || routePoints.length === 0) {
      throw new Error(`Invalid route points for ${route.id}`);
    }

    console.log(`Route points for ${route.id}:`, routePoints.length, "points found.");


    const [potholes, complaints, spots,events, banquethalls, gardens, hospitals, hotels, malls, parkingbuildings, schools, diversions, constructions, trafficStatuses] = responses;
    // console.log("All SPOTS :--------",spots);
    let customScore = 5 * potholes.length + 
                        10 * spots.length +
                       5 * complaints.length +
                       10 * banquethalls.length + 
                       1 * gardens.length + 
                       1 * hospitals.length +
                       1 * hotels.length +
                       2 * malls.length +
                       3 * schools.length +
                    //    9 * trafficStatuses.length+
                       1 * parkingbuildings.length +
                        10 * events.length  +
                       10 * diversions.length +
                       10 * constructions.length ;

    //  console.log("malls :------------------------------------------------------------->>>>>>> ", malls.length);
    // console.log("Hotspots :------------------------------------------------------------->>>>>>> ", spots.length);
    //  console.log("Construction score:------------------------------------------------------------->>>>>>> ", constructions.length);
    // console.log("Custom score:------------------------------------------------------------->>>>>>> ", customScore);
    
    const maxExpectedScore = 300;
    const normalizedCustomScore = (Math.log(customScore + 1) / Math.log(maxExpectedScore + 1)) * 100;

    const trafficStatus = await getTrafficStatusUsingJsApi(route.source, route.destination);
    
    const finalScore = (0.7 * trafficStatus.score) + (0.3 * normalizedCustomScore);
    console.log("FINAL score: ", finalScore);

    return {
      routeId: route.id,
      totalscore: finalScore,
      timestamp: new Date()
    };
  } catch (error) {
    console.error(`Error calculating traffic score for route ${route.id}:`, error);
    return null;
  }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = angle => (Math.PI / 180) * angle;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchData(endpoint, routeId, routePoints) {
  try {
    // console.log("Fetching data for route id: ", routeId);
    // const response = await axios.get(`http://localhost:3001/api${endpoint}?routeId=${routeId}`);
    // const data = response.data || [];

    // //ADD THE IF ELSE STATEMENTS FOR ALL REMAINING DIFFERENT MODELS ENDPOINTS BUT KEEP THE FILTERING OF DISTANCE AS EQUAL AS REMAININGS

    // return data.filter(item => {
    //   return routePoints.some(routePoint => {
    //     return haversineDistance(
    //       parseFloat(item.latitude),
    //       parseFloat(item.longitude),
    //       routePoint.lat,
    //       routePoint.lng
    //     ) <= 100;
    //   });
    // });
    console.log("Fetching data for route id: ", routeId);
    const response = await axios.get(`https://road-traffic-backend.onrender.com/api${endpoint}?routeId=${routeId}`);
    const data = response.data || [];

    // console.log(`endpoint : ${endpoint} data : ${data}`);

    return data.filter(item => {
      let locations = [];

      // Handling different models
      if (item.latitude !== undefined && item.longitude !== undefined) {
        // Model with direct latitude & longitude
        locations.push({ lat: parseFloat(item.latitude), lng: parseFloat(item.longitude) });
      } else if (item.eventPoints) {
        // Event model with eventPoints array
        locations = item.eventPoints.map(point => ({ lat: point.lat, lng: point.lng }));
      } else if (item.constructionPoints) {
        // Construction model with constructionPoints array
        locations = item.constructionPoints.map(point => ({ lat: point.lat, lng: point.lng }));
      } else if (item.diversionPoints) {
        // Diversion model with diversionPoints array
        locations = item.diversionPoints.map(point => ({ lat: point.lat, lng: point.lng }));
      }

      // Check if any of the extracted locations are within 100 meters
      return locations.some(location => 
        routePoints.some(routePoint => 
          haversineDistance(location.lat, location.lng, routePoint.lat, routePoint.lng) <= 100
        )
      );
    });
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error);
    return [];
  }
}

async function getTrafficStatusUsingJsApi(origin, destination) {
  try {
    const directions = await googleMapsClient.directions({
      origin: origin,
      destination: destination,
      mode: 'driving',
      departure_time: 'now'
    }).asPromise();

    const leg = directions.json.routes[0].legs[0];
    const durationInTraffic = leg.duration_in_traffic.value;
    const normalDuration = leg.duration.value;

    const trafficFactor = durationInTraffic / normalDuration;

    let trafficScore = trafficFactor >= 1.5 ? 100 :
                   trafficFactor >= 1.45 ? 95 :
                   trafficFactor >= 1.40 ? 90 :
                   trafficFactor >= 1.35 ? 85 :
                   trafficFactor >= 1.30 ? 80 :
                   trafficFactor >= 1.25 ? 75 :
                   trafficFactor >= 1.20 ? 70 :
                   trafficFactor >= 1.15 ? 65 :
                   trafficFactor >= 1.10 ? 60 :
                   trafficFactor >= 1.05 ? 55 :
                   trafficFactor >= 1.00 ? 50 :
                   trafficFactor >= 0.95 ? 45 :
                   trafficFactor >= 0.90 ? 40 :
                   trafficFactor >= 0.85 ? 35 :
                   trafficFactor >= 0.80 ? 30 :
                   trafficFactor >= 0.75 ? 25 :
                   trafficFactor >= 0.70 ? 20 :
                   trafficFactor >= 0.65 ? 15 :
                   trafficFactor >= 0.60 ? 10 :
                   trafficFactor >= 0.50 ? 5 : 5;


    console.log(" google maps traffic factor : ----------->",trafficFactor);
    return { score: trafficScore };
  } catch (error) {
    console.error('Error fetching traffic status:', error);
    return { status: 'Unknown', score: 0 };
  }
}

async function storePathInfo(pathInfo) {
  try {


    console.log("Storing path info: ", pathInfo);
    const response = await axios.post(`https://road-traffic-backend.onrender.com/api/path-info/`,pathInfo);


  } catch (error) {
    console.error(`Error storing path info for route ${pathInfo.routeId}:`, error);
  }
}

const determineTimeRange = (currentDate) => {
    const hours = currentDate.getHours();
    const ranges = [
      '00-02',
      '02-04',
      '04-06',
      '06-08',
      '08-10',
      '10-12',
      '12-14',
      '14-16',
      '16-18',
      '18-20',
      '20-22',
      '22-24',
    ];
    return ranges[Math.floor(hours / 2)];
  };

async function runTrafficMonitoring() {
  for (const route of routes) {
    const score  = await calculateTrafficScore(route);

    const timeRange = determineTimeRange(new Date()); 
        const level = score.totalscore >= 80 ? 'very high' :
              score.totalscore >= 60 ? 'high' :
              score.totalscore >= 30 ? 'medium' :
              score.totalscore >= 15 ? 'low' : 'very low';
    
    const pathInfo = {
        pathId: route.id,
        timeRange,
        date: new Date(),
        score:score.totalscore,
        level,
      };
    if (pathInfo) {
      await storePathInfo(pathInfo);
    }
  }
}

runTrafficMonitoring();

