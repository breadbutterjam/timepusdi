let arrData = "3.141592653589793238462643383279502884197169399375105820"
let currInd = 0;

function onBodyLoad()
{
    // alert("A");
    addEventListener()
    populateSelectOption();
}

function populateSelectOption(){
    let selectElem = document.querySelector("#digitCountSelect");
    let numDigits = arrData.length - 2; // Subtract 2 to exclude "3."
    for (let i = 1; i <= numDigits; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        selectElem.appendChild(option);
    }
}

function onDigitCountChange(){
    document.querySelector("#selectCont").classList.add("hdn");
    let nDigit = document.querySelector("#digitCountSelect").value;
    document.querySelector(".digitCountCont").innerText = String(nDigit).trim();
    currInd = parseInt(nDigit);
    nextDigit();
}

function addEventListener(){
    document.querySelector(".mainCont").addEventListener("click", nextDigit);

    document.querySelector(".resetBtnArea").addEventListener("click", resetAll);    

    document.querySelector(".digitCountCont").addEventListener("click", digitCountContClick);

    document.querySelector("#digitCountSelect").addEventListener("change", onDigitCountChange);
}

function digitCountContClick(){
    // console.log("digitCountContClick")
    if (document.querySelector("#selectCont").classList.contains("hdn")){
    document.querySelector("#selectCont").classList.remove("hdn");
    } else {
        document.querySelector("#selectCont").classList.add("hdn");
    }
}

function resetAll(){
    console.log("resetBtnArea")
    let yesNoConf = confirm("Are you sure you want to reset?");
    
    if (yesNoConf){
        currInd = -1;
        nextDigit();
    }
}

function nextDigit(){
    currInd++;
    console.log("currInd: ", currInd);
    document.querySelector(".resetBtnArea").innerText = String(currInd-1).trim();

    document.querySelector(".mainContent").innerText = arrData.charAt(currInd);
    document.querySelector(".digitCountCont").innerText = String(currInd-1).trim();
    // document.querySelector(".mainCont").style.fontSize = "21.7em";

}