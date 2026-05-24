/*
{ date: "2026-05-12", tides: [
        { type: "low", time: "02:03", height: 1.56 },
        { type: "high", time: "08:15", height: 3.25 },
        { type: "low", time: "14:03", height: 1.86 },
        { type: "high", time: "20:13", height: 3.69 }
      ], sunrise: "06:05", sunset: "19:04" },
*/
let tideBoxes;
tideBoxes = document.getElementsByClassName("tide_flex_start")[0].children;


function getTideDataFromTideRow(data) {
    let rows = data.querySelectorAll("td");
    
    let type = rows[0].innerText.trim().toLowerCase();
    if (type === "high tide") {
        type = "high";
    } else if (type === "low tide") {
        type = "low";
    }


    let time = rows[1].innerText.split("\n")[0].trim();
    time = to24h(time);

    let height = Number(rows[2].innerText.split("\n")[0].trim().split(" ")[0]);

    return { type, time, height };

}

function to24h(timeStr) {
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let [, h, m, meridian] = match;
  h = parseInt(h);

  if (meridian.toUpperCase() === "PM" && h !== 12) h += 12;
  if (meridian.toUpperCase() === "AM" && h === 12) h = 0;

  return `${String(h).padStart(2, "0")}:${m}`;
}

// function to24h(timeStr) {
//   const [time, modifier] = timeStr.trim().split(" ");
//   let [hours, minutes] = time.split(":").map(Number);

//   if (modifier === "PM" && hours !== 12) hours += 12;
//   if (modifier === "AM" && hours === 12) hours = 0;

//   return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
// }

function getDataFromTideBox(data) {
    let dateInfo = data.getElementsByTagName("h4")[0].innerText.split(":")[1].trim();
    let date = formatDate(dateInfo);
    // console.log(date);
    let tides = [];
    let tideRows = data.querySelectorAll('.tide-day-tides tr');
    tideRows.forEach(function(row, index) {
        if (index === 0) return; // Skip header row
        tides.push(getTideDataFromTideRow(row));
    });

    let sunrise = to24h(data.querySelectorAll(".tide-day__sun-moon-cell")[0].querySelectorAll('.tide-day__value')[0].innerText.trim());
    let sunset = to24h(data.querySelectorAll(".tide-day__sun-moon-cell")[1].querySelectorAll('.tide-day__value')[0].innerText.trim());

    return { date, tides, sunrise, sunset };

}

function formatDate(input) {
  const parts = input.split(" "); 
  // ["Sunday", "24", "May", "2026"]

  const day = parts[1].padStart(2, "0");
  const monthName = parts[2];
  const year = parts[3];

  const months = {
    January: "01", February: "02", March: "03", April: "04",
    May: "05", June: "06", July: "07", August: "08",
    September: "09", October: "10", November: "11", December: "12"
  };

  const month = months[monthName];

  return `${year}-${month}-${day}`;
}

let tideData = [];
function getTideData() {
  tideData = [];
  for (let i = 0; i < tideBoxes.length; i++) {
    tideData.push(getDataFromTideBox(tideBoxes[i]));
  }

  let finalData = toJSObjectString(tideData);
  copy(finalData);

  return tideData;
}