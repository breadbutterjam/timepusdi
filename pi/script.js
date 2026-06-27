let arrData = "3.141592653589793238462643383279502884197169399375105820"
let currInd = 0;

function onBodyLoad()
{
    // alert("A");
    addEventListener()
}

function addEventListener(){
    document.querySelector(".mainCont").addEventListener("click", nextDigit);

    document.querySelector(".resetBtnArea").addEventListener("click", resetAll);    
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