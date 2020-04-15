const login = document.querySelector("body > nav .login");
const logout = document.querySelector("body > nav .logout");

fetch("/me").then(res => {
    (res.status === 200 ? logout : login).classList.remove("hidden");
});
