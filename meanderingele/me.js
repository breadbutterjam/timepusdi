function getRandomNumberBetween(min, max)
{
	diff = max - min; 
    a = Math.random() * diff; 
	b = Number(a.toFixed(0)) + min;
	
	return b;
}

let imgWt = 100; 
let imgHt = 100;
let leftMax, topMax; 
let oEle;

function onBodyLoad(){
	
	//alert("A");
	leftMax = window.innerWidth - imgWt;
	topMax = window.innerHeight - imgHt;
	oEle = document.getElementById("me");	
	
	document.body.addEventListener("click", documentClicked);
	//document.body.addEventListener("click", moveToNextPos);
	
	rs = document.getElementById("rs")
}
let rs;

function documentClicked(event){
	//console.log(event.pageX, event.pageY);
	//moveEleTo(event.pageX, event.pageY);
	moveToNextPos(event.pageX, event.pageY);
}

function moveRandom(){
	
	let oPos = getRandomPos();
	moveEleTo(oPos.left, oPos.top);
	
}

function moveEleTo(nLeft, nTop, elemParam){
	
	if (elemParam === undefined){
		elemParam = oEle;
		
	}
	
	elemParam.style.left = String(nLeft).trim() + "px";
	elemParam.style.top = String(nTop).trim() + "px";
	
}

function getRandomPos(){
	let nLeft, nTop; 
	nLeft = getRandomNumberBetween(0, leftMax);
	nTop = getRandomNumberBetween(0, topMax);
	
	return {
		top: nTop,
		left: nLeft
	}
}


let nLeftInc, nTopInc; 
let oMoveTimer;
let timerCount = 0;

let incrementDivisions = 100;
let timerInterval = 10;

function radians_to_degrees(radians)
{
  var pi = Math.PI;
  return radians * (180/pi);
}

function moveToNextPos(nLeft, nTop){
	let newPos, nNewLeft, nNewTop; 
	if (nLeft === undefined)
	{
		newPos = getRandomPos();
		nNewLeft = newPos.left;
		nNewTop = newPos.top;	
	}
	else
	{
		nNewLeft = nLeft;
		nNewTop = nTop;
	}
	
	
	let nCurrLeft = +oEle.style.left.replace("px", "");
	let nCurrTop = +oEle.style.top.replace("px", "");
	
	//Math.atan2(y2 - y1, x2 - x1);
	let angl = Math.atan2(nNewTop - nCurrTop, nNewLeft - nCurrLeft);
	console.log(radians_to_degrees(angl));
	
	oEle.style.transform = "rotate(" + String(radians_to_degrees(angl)).trim() + "deg)";
	
	let nDiffLeft = nNewLeft - nCurrLeft;
	let nDiffTop = nNewTop - nCurrTop;
	
	nLeftInc = nDiffLeft / incrementDivisions;
	nTopInc = nDiffTop / incrementDivisions;
	
	oMoveTimer = setInterval(moveEle, timerInterval);
	timerCount = 0;
}

function moveEle(){
	let nCurrLeft = +oEle.style.left.replace("px", "");
	let nCurrTop = +oEle.style.top.replace("px", "");
	
	let nNewLeft = nCurrLeft + nLeftInc;
	let nNewTop = nCurrTop + nTopInc;

	moveEleTo(nNewLeft, nNewTop);
	timerCount++;
	
	if (timerCount === incrementDivisions){
		clearInterval(oMoveTimer);
	}
}
